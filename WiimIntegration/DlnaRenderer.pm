package Plugins::WiimIntegration::DlnaRenderer;

use strict;
use warnings;

use IO::Socket::INET;
use Socket qw(
    SOL_SOCKET SO_REUSEADDR SOCK_DGRAM IPPROTO_IP IP_ADD_MEMBERSHIP
    pack_sockaddr_in inet_aton inet_ntoa sockaddr_in
);

use Slim::Networking::IO::Select qw(addRead removeRead);
use Slim::Utils::Log;
use Slim::Utils::Network;
use Slim::Utils::Prefs;
use Slim::Utils::Timers;
use Slim::Web::HTTP;
use Slim::Web::Pages;

my $log = Slim::Utils::Log->addLogCategory({
    category     => 'plugin.wiim_integration.dlna',
    defaultLevel => 'INFO',
    description  => 'Wiim Integration DLNA renderer',
});

my $prefs = preferences('plugin.wiim_integration');

# Hooks supplied by Plugin.pm. This file only speaks UPnP.
my %hook;
my $sock;
my $timer_key = {};
my $http_on;
my $ssdp_ok;
my $lms_registered;

# One virtual renderer. Controls and artwork stay with Wiim Integration.
my %session = (
    transport => 'STOPPED',
    uri       => '',
    meta_xml  => '',
    peer      => '',
    source_id => '',
    volume    => 50,
    mute      => 0,
    mirrored  => '',
    meta_sig  => '',
);

my %subs;
my $sid_n = 0;

my $AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
my $CM  = 'urn:schemas-upnp-org:service:ConnectionManager:1';
my $RC  = 'urn:schemas-upnp-org:service:RenderingControl:1';
my $DEV = 'urn:schemas-upnp-org:device:MediaRenderer:1';

sub start {
    my $hooks = @_ && ref $_[0] ? $_[0] : $_[1];
    %hook = ref $hooks eq 'HASH' ? %$hooks : ();
    _uuid();
    _restore_cast();
    register_http();
    $log->info('DLNA renderer ' . _friendly_name() . ' http ready');
}

# Prefer LMS Discovery when this process already holds UDP 1900.
# Otherwise answer M-SEARCH ourselves. squeeze2upnp often owns 1900 and
# LMS Discovery then has no socket, so a register() alone sends nothing.
sub register_discovery {
    return 1 if $ssdp_ok;
    $lms_registered = _register_lms();
    my $own = 0;
    if (!_process_owns_udp(1900)) {
        $own = _listen_ssdp();
        if ($own) {
            _announce();
            Slim::Utils::Timers::killTimers($timer_key, \&_announce_loop);
            Slim::Utils::Timers::setTimer($timer_key, time() + 300, \&_announce_loop);
        }
    }
    $ssdp_ok = ($own || ($lms_registered && _process_owns_udp(1900))) ? 1 : 0;
    if ($ssdp_ok) {
        $log->info('DLNA renderer ' . _friendly_name() . ($own ? ' own SSDP socket' : ' LMS discovery'));
    }
    else {
        $log->warn('DLNA renderer has no SSDP listener');
    }
    return $ssdp_ok ? 1 : 0;
}

sub _register_lms {
    my $ok = eval {
        require Slim::Plugin::UPnP::Discovery;
        Slim::Plugin::UPnP::Discovery->register(
            uuid     => _uuid(),
            url      => '/plugins/WiimIntegration/dlna/device.xml',
            ttl      => 1800,
            device   => $DEV,
            services => [ $CM, $AVT, $RC ],
        );
        1;
    };
    $log->warn('DLNA discovery register failed: ' . ($@ || 'unknown')) unless $ok;
    return $ok ? 1 : 0;
}

sub stop {
    Slim::Utils::Timers::killTimers($timer_key, \&_announce_loop);
    if ($sock) {
        removeRead($sock);
        eval { $sock->close() };
        $sock = undef;
    }
    if ($lms_registered) {
        eval {
            require Slim::Plugin::UPnP::Discovery;
            Slim::Plugin::UPnP::Discovery->unregister(_uuid());
        };
        $lms_registered = 0;
    }
    $ssdp_ok = 0;
}

sub register_http {
    return if $http_on;
    return unless main::WEBUI;
    Slim::Web::Pages->addRawFunction(
        qr{^/plugins/WiimIntegration/dlna(?:/.*)?$},
        \&handle_http
    );
    $http_on = 1;
}

sub _remember_cast {
    my $uri = $session{uri} || '';
    return unless $uri =~ m{^https?://}i;
    $prefs->set('dlna_last_uri', {
        uri       => $uri,
        peer      => $session{peer} || '',
        source_id => lc($session{source_id} || ''),
    });
}

sub _restore_cast {
    return if ($session{uri} || '') =~ m{^https?://}i;
    my $saved = eval { $prefs->get('dlna_last_uri') };
    return unless ref $saved eq 'HASH';
    my $uri = $saved->{uri} || '';
    return unless $uri =~ m{^https?://}i;
    $session{uri} = $uri;
    $session{peer} = $saved->{peer} || '';
    $session{source_id} = lc($saved->{source_id} || '');
    $log->info("DLNA restored last cast $uri");
}

sub status {
    return {
        name      => _friendly_name(),
        uuid      => _uuid(),
        ssdp      => $ssdp_ok ? 1 : 0,
        transport => $session{transport},
        uri       => $session{uri},
        peer      => $session{peer},
        source_id => $session{source_id},
        title     => $session{title} || '',
        artist    => $session{artist} || '',
        cover     => $session{cover} || '',
    };
}

# Wiim Integration learned a new transport or a new cover for a WiiM.
# Apply it to the players already receiving this cast. Do not open a session.
sub note_source {
    my $client = @_ && ref $_[0] ? $_[0] : $_[1];
    return unless $session{uri};
    return unless $client;
    my $id = lc($client->id() || '');
    my $ip = eval { $client->ip() } || '';
    $ip =~ s/:\d+$//;
    my $match = ($session{source_id} && $id eq $session{source_id})
        || ($session{peer} && $ip && $ip eq $session{peer});
    return unless $match;
    _mirror($client);
}

sub handle_http {
    my ($http_client, $response) = @_;
    my $req  = eval { $response->request } || return;
    my $path = eval { $req->uri->path } || '';
    my $method = uc($req->method || 'GET');

    if ($path =~ m{/device\.xml$}) {
        return _http_xml($http_client, $response, _device_xml());
    }
    if ($path =~ m{/avt\.xml$}) {
        return _http_xml($http_client, $response, _scpd_avt());
    }
    if ($path =~ m{/cm\.xml$}) {
        return _http_xml($http_client, $response, _scpd_cm());
    }
    if ($path =~ m{/rc\.xml$}) {
        return _http_xml($http_client, $response, _scpd_rc());
    }
    if ($path =~ m{/event}) {
        return _http_event($http_client, $response, $req, $method);
    }
    if ($method eq 'POST' || $method eq 'M-POST') {
        return _http_soap($http_client, $response, $req, $path);
    }
    _http_text($http_client, $response, 404, 'text/plain', 'not found');
}

sub _process_owns_udp {
    my $port = shift || return 0;
    open my $udp, '<', '/proc/net/udp' or return 0;
    my %inode;
    while (<$udp>) {
        my @f = split;
        next unless @f > 9 && $f[1] && $f[1] =~ /:([0-9A-Fa-f]+)$/;
        next unless hex($1) == $port;
        $inode{$f[9]} = 1 if $f[9] =~ /^\d+$/;
    }
    close $udp;
    return 0 unless %inode;
    opendir my $dir, "/proc/$$/fd" or return 0;
    for my $fd (readdir $dir) {
        my $link = readlink("/proc/$$/fd/$fd") || next;
        return 1 if $link =~ /^socket:\[(\d+)\]$/ && $inode{$1};
    }
    return 0;
}

sub _announce_loop {
    _announce();
    Slim::Utils::Timers::setTimer($timer_key, time() + 300, \&_announce_loop);
}

sub _listen_ssdp {
    if ($sock) {
        removeRead($sock);
        eval { $sock->close() };
        $sock = undef;
    }
    $sock = IO::Socket::INET->new(
        Proto     => 'udp',
        Type      => SOCK_DGRAM,
        Blocking  => 0,
        ReuseAddr => 1,
    );
    unless ($sock) {
        $log->warn("DLNA SSDP socket failed: $!");
        return 0;
    }
    my $reuseport = eval { no strict 'subs'; Socket::SO_REUSEPORT(); };
    $reuseport = 15 if !$reuseport && $^O eq 'linux';
    setsockopt($sock, SOL_SOCKET, $reuseport, pack('I', 1)) if $reuseport;
    unless ($sock->bind(pack_sockaddr_in(1900, inet_aton('0.0.0.0')))) {
        $log->warn("DLNA SSDP bind 1900 failed: $!");
        eval { $sock->close() };
        $sock = undef;
        return 0;
    }
    my $mreq = inet_aton('239.255.255.250') . inet_aton('0.0.0.0');
    unless (setsockopt($sock, IPPROTO_IP, IP_ADD_MEMBERSHIP, $mreq)) {
        $log->warn("DLNA SSDP multicast join failed: $!");
        eval { $sock->close() };
        $sock = undef;
        return 0;
    }
    addRead($sock, \&_on_ssdp);
    return 1;
}

sub _on_ssdp {
    my $fd = shift || $sock || return;
    my $buf = '';
    my $peer = recv($fd, $buf, 4096, 0);
    return unless defined $peer && $buf =~ /M-SEARCH/i;
    my ($st) = $buf =~ /^ST:\s*(.+)\s*$/mi;
    $st =~ s/\s+$// if defined $st;
    $st = '' unless defined $st;
    return unless _search_matches($st);
    my ($port, $addr) = sockaddr_in($peer);
    my $ip = inet_ntoa($addr);
    return unless $ip && $port;
    my $dest = pack_sockaddr_in($port, $addr);
    send($fd, _search_response($st), 0, $dest);
}

sub _search_matches {
    my $st = shift || '';
    return 1 if $st eq 'ssdp:all' || $st eq 'upnp:rootdevice' || $st eq $DEV;
    return 1 if $st eq $AVT || $st eq $CM || $st eq $RC;
    return 1 if $st eq 'uuid:' . _uuid();
    return 0;
}

sub _announce {
    return unless $sock;
    my $dest = pack_sockaddr_in(1900, inet_aton('239.255.255.250'));
    for my $nt ('upnp:rootdevice', 'uuid:' . _uuid(), $DEV, $AVT, $CM, $RC) {
        send($sock, _notify_alive($nt), 0, $dest);
    }
}

sub _notify_alive {
    my $nt = shift;
    my $usn = $nt eq 'uuid:' . _uuid() ? $nt : 'uuid:' . _uuid() . '::' . $nt;
    return _ssdp_headers(
        "NOTIFY * HTTP/1.1",
        Host            => '239.255.255.250:1900',
        'CACHE-CONTROL' => 'max-age=1800',
        LOCATION        => _base() . '/plugins/WiimIntegration/dlna/device.xml',
        NT              => $nt,
        NTS             => 'ssdp:alive',
        SERVER          => _server_token(),
        USN             => $usn,
    );
}

sub _search_response {
    my $st = shift || $DEV;
    $st = $DEV if $st eq 'ssdp:all' || $st eq 'upnp:rootdevice';
    my $usn = ($st eq 'uuid:' . _uuid()) ? $st : 'uuid:' . _uuid() . '::' . $st;
    return _ssdp_headers(
        "HTTP/1.1 200 OK",
        'CACHE-CONTROL' => 'max-age=1800',
        EXT             => '',
        LOCATION        => _base() . '/plugins/WiimIntegration/dlna/device.xml',
        SERVER          => _server_token(),
        ST              => $st,
        USN             => $usn,
    );
}

sub _ssdp_headers {
    my ($start, %h) = @_;
    my $msg = $start . "\r\n";
    for my $k (qw(Host CACHE-CONTROL EXT LOCATION NT NTS SERVER ST USN)) {
        next unless exists $h{$k};
        $msg .= "$k: $h{$k}\r\n";
    }
    return $msg . "\r\n";
}

sub _http_soap {
    my ($http_client, $response, $req, $path) = @_;
    my $body = $req->content || '';
    my $soap = $req->header('SOAPACTION') || $req->header('SOAPAction') || '';
    my ($action) = $soap =~ /#([A-Za-z0-9]+)/;
    ($action) = $body =~ /<u:([A-Za-z0-9]+)/ unless $action;
    my $service = $AVT;
    $service = $CM if $path =~ m{/cm(?:/|$)};
    $service = $RC if $path =~ m{/rc(?:/|$)};

    my $peer = eval { $http_client->peerhost() } || '';
    my ($code, $inner) = _soap_action($service, $action || '', $body, $peer);
    if ($code != 200) {
        my $fault = _soap_fault($inner || 'Invalid Action', 401);
        return _http_text($http_client, $response, 500, 'text/xml; charset="utf-8"', $fault);
    }
    my $xml = _soap_ok($service, $action, $inner || '');
    _http_text($http_client, $response, 200, 'text/xml; charset="utf-8"', $xml);
}

sub _soap_action {
    my ($service, $action, $body, $peer) = @_;
    return (500, 'Invalid Action') unless $action;

    if ($service eq $AVT) {
        return _avt($action, $body, $peer);
    }
    if ($service eq $CM) {
        return _cm($action);
    }
    if ($service eq $RC) {
        return _rc($action, $body);
    }
    return (500, 'Invalid Action');
}

sub _avt {
    my ($action, $body, $peer) = @_;
    if ($action eq 'SetAVTransportURI' || $action eq 'SetNextAVTransportURI') {
        my ($uri) = $body =~ /<CurrentURI[^>]*>(.*?)<\/CurrentURI>/si;
        ($uri) = $body =~ /<NextURI[^>]*>(.*?)<\/NextURI>/si unless defined $uri && $uri ne '';
        my ($meta) = $body =~ /<CurrentURIMetaData[^>]*>(.*?)<\/CurrentURIMetaData>/si;
        ($meta) = $body =~ /<NextURIMetaData[^>]*>(.*?)<\/NextURIMetaData>/si unless defined $meta;
        $uri  = _xml_decode($uri || '');
        $meta = _xml_decode($meta || '');
        if ($action eq 'SetAVTransportURI') {
            $session{uri}      = $uri;
            $session{meta_xml} = $meta;
            $session{peer}     = $peer;
            my $didl = _parse_didl($meta);
            $session{didl} = $didl;
            $log->info("DLNA SetAVTransportURI from $peer $uri");
            _remember_cast();
            if ($session{transport} eq 'PLAYING' && $uri =~ m{^https?://}i) {
                _play($peer);
            }
        }
        return (200, '');
    }
    if ($action eq 'Play') {
        $session{transport} = 'PLAYING';
        $session{peer} ||= $peer;
        $log->info('DLNA Play from ' . ($peer || '?'));
        _play($peer);
        _notify();
        return (200, '');
    }
    if ($action eq 'Pause') {
        $session{transport} = 'PAUSED_PLAYBACK';
        _transport('pause');
        _notify();
        return (200, '');
    }
    if ($action eq 'Stop') {
        $session{transport} = 'STOPPED';
        _transport('stop');
        _notify();
        return (200, '');
    }
    if ($action eq 'Seek' || $action eq 'Next' || $action eq 'Previous') {
        # Wiim Integration owns skip and seek on the WiiM. Accept the call.
        return (200, '');
    }
    if ($action eq 'GetTransportInfo') {
        return (200, '<CurrentTransportState>' . _xml($session{transport})
            . '</CurrentTransportState><CurrentTransportStatus>OK</CurrentTransportStatus><CurrentSpeed>1</CurrentSpeed>');
    }
    if ($action eq 'GetMediaInfo' || $action eq 'GetMediaInfo_Ext') {
        return (200, '<NrTracks>1</NrTracks><MediaDuration>' . _hms($session{duration})
            . '</MediaDuration><CurrentURI>' . _xml($session{uri})
            . '</CurrentURI><CurrentURIMetaData>' . _xml($session{meta_xml})
            . '</CurrentURIMetaData><NextURI></NextURI><NextURIMetaData></NextURIMetaData>'
            . '<PlayMedium>NETWORK</PlayMedium><RecordMedium>NOT_IMPLEMENTED</RecordMedium>'
            . '<WriteStatus>NOT_IMPLEMENTED</WriteStatus>');
    }
    if ($action eq 'GetPositionInfo') {
        return (200, '<Track>1</Track><TrackDuration>' . _hms($session{duration})
            . '</TrackDuration><TrackMetaData>' . _xml($session{meta_xml})
            . '</TrackMetaData><TrackURI>' . _xml($session{uri})
            . '</TrackURI><RelTime>' . _hms($session{time})
            . '</RelTime><AbsTime>' . _hms($session{time})
            . '</AbsTime><RelCount>2147483647</RelCount><AbsCount>2147483647</AbsCount>');
    }
    if ($action eq 'GetDeviceCapabilities') {
        return (200, '<PlayMedia>NETWORK</PlayMedia><RecMedia>NOT_IMPLEMENTED</RecMedia><RecQualityModes>NOT_IMPLEMENTED</RecQualityModes>');
    }
    if ($action eq 'GetTransportSettings') {
        return (200, '<PlayMode>NORMAL</PlayMode><RecQualityMode>NOT_IMPLEMENTED</RecQualityMode>');
    }
    if ($action eq 'GetCurrentTransportActions') {
        return (200, '<Actions>Play,Pause,Stop</Actions>');
    }
    $log->info("DLNA AVTransport ignore $action");
    return (200, '');
}

sub _cm {
    my $action = shift;
    if ($action eq 'GetProtocolInfo') {
        my $sink = 'http-get:*:audio/mpeg:*,http-get:*:audio/flac:*,http-get:*:audio/x-flac:*,http-get:*:audio/aac:*,http-get:*:audio/mp4:*,http-get:*:audio/L16:*';
        return (200, '<Source></Source><Sink>' . $sink . '</Sink>');
    }
    if ($action eq 'GetCurrentConnectionIDs') {
        return (200, '<ConnectionIDs>0</ConnectionIDs>');
    }
    if ($action eq 'GetCurrentConnectionInfo') {
        return (200, '<RcsID>0</RcsID><AVTransportID>0</AVTransportID><ProtocolInfo>http-get:*:audio/mpeg:*</ProtocolInfo><PeerConnectionManager></PeerConnectionManager><PeerConnectionID>-1</PeerConnectionID><Direction>Input</Direction><Status>OK</Status>');
    }
    return (200, '');
}

sub _rc {
    my ($action, $body) = @_;
    if ($action eq 'GetVolume') {
        return (200, '<CurrentVolume>' . (0 + $session{volume}) . '</CurrentVolume>');
    }
    if ($action eq 'SetVolume') {
        my ($vol) = $body =~ /<DesiredVolume[^>]*>(\d+)<\/DesiredVolume>/i;
        $session{volume} = 0 + $vol if defined $vol;
        return (200, '');
    }
    if ($action eq 'GetMute') {
        return (200, '<CurrentMute>' . ($session{mute} ? 1 : 0) . '</CurrentMute>');
    }
    if ($action eq 'SetMute') {
        my ($mute) = $body =~ /<DesiredMute[^>]*>(\d+)<\/DesiredMute>/i;
        $session{mute} = $mute ? 1 : 0 if defined $mute;
        return (200, '');
    }
    if ($action eq 'ListPresets') {
        return (200, '<CurrentPresetNameList>FactoryDefaults</CurrentPresetNameList>');
    }
    return (200, '');
}

sub _play {
    my $peer = shift || $session{peer} || '';
    my $uri = $session{uri} || '';
    unless ($uri =~ m{^https?://}i) {
        $log->info('DLNA Play without an HTTP URI');
        return;
    }
    my $src = _source($peer);
    if ($src && $src->{id}) {
        $session{source_id} = lc($src->{id});
    }
    _remember_cast();
    my $meta = _merged_meta($src);
    $session{title}    = $meta->{title};
    $session{artist}   = $meta->{artist};
    $session{cover}    = $meta->{cover};
    $session{time}     = $src->{time} || 0;
    $session{duration} = $src->{duration} || 0;
    $session{mirrored} = 'play';
    $session{meta_sig} = _sig($meta);
    my $play = $hook{play_on} || return;
    my @targets = _targets();
    if (!@targets) {
        $log->info('DLNA Play held: no Lyrion player selected');
        return;
    }
    for my $client (@targets) {
        $play->($client, $uri, $meta);
    }
}

sub _transport {
    my $how = shift || return;
    $session{mirrored} = $how;
    my $fn = $hook{transport_on} || return;
    for my $client (_targets()) {
        $fn->($client, $how, $session{uri});
    }
}

sub _mirror {
    my $client = shift;
    my $src = _source_from_client($client);
    return unless $src;
    $session{time}     = $src->{time} || 0;
    $session{duration} = $src->{duration} || 0;
    my $ps = lc($src->{play_state} || '');
    my $meta = _merged_meta($src);
    my $sig = _sig($meta);
    if ($ps eq 'pause' || $ps eq 'paused') {
        return if ($session{mirrored} || '') eq 'pause';
        $session{transport} = 'PAUSED_PLAYBACK';
        _transport('pause');
        _notify();
        return;
    }
    if ($ps eq 'stop' || $ps eq 'off') {
        return if ($session{mirrored} || '') eq 'stop';
        $session{transport} = 'STOPPED';
        _transport('stop');
        _notify();
        return;
    }
    return unless $ps eq 'play' || $ps eq 'playing';
    return unless $session{transport} eq 'PLAYING';
    $session{title}  = $meta->{title};
    $session{artist} = $meta->{artist};
    $session{cover}  = $meta->{cover};
    if (($session{meta_sig} || '') ne $sig) {
        $session{meta_sig} = $sig;
        my $refresh = $hook{refresh_on};
        if ($refresh) {
            for my $target (_targets()) {
                $refresh->($target, $session{uri}, $meta);
            }
        }
    }
    if (($session{mirrored} || '') eq 'stop') {
        _play($session{peer});
    }
    elsif (($session{mirrored} || '') ne 'play') {
        _transport('play');
    }
}

# A player just added from the extras page joins a cast already in progress.
sub catch_up {
    my $client = @_ && ref $_[0] ? $_[0] : $_[1];
    return unless $client && $session{transport} eq 'PLAYING' && $session{uri};
    my $play = $hook{play_on} || return;
    my $src = _source($session{peer});
    $play->($client, $session{uri}, _merged_meta($src));
}

sub _source {
    my $peer = shift || '';
    my $fn = $hook{source_for_ip} || return;
    my $src = $fn->($peer);
    return $src if $src && ref $src eq 'HASH';
    return;
}

sub _source_from_client {
    my $client = shift || return;
    my $fn = $hook{source_for_client} || return;
    return $fn->($client);
}

sub _targets {
    my $fn = $hook{targets} || return;
    my @all = $fn->($session{source_id} || '');
    return @all;
}

sub _merged_meta {
    my $src = shift || {};
    my $didl = $session{didl} || {};
    my $base = _base();
    my $cover = $src->{cover} || $didl->{cover} || '';
    $cover = $base . $cover if $cover =~ m{^/};
    return {
        title  => $src->{title}  || $didl->{title}  || 'WiiM',
        artist => $src->{artist} || $didl->{artist} || '',
        album  => $src->{album}  || $didl->{album}  || '',
        cover  => $cover,
    };
}

sub _sig {
    my $meta = shift || {};
    return join("\t", map { $meta->{$_} || '' } qw(title artist album cover));
}

sub _parse_didl {
    my $didl = shift || '';
    my ($title)  = $didl =~ /<dc:title>([^<]*)</i;
    my ($artist) = $didl =~ /<(?:upnp:artist|dc:creator)>([^<]*)</i;
    my ($album)  = $didl =~ /<upnp:album>([^<]*)</i;
    my ($cover)  = $didl =~ /<upnp:albumArtURI[^>]*>([^<]*)</i;
    return {
        title  => $title  || '',
        artist => $artist || '',
        album  => $album  || '',
        cover  => $cover  || '',
    };
}

sub _http_event {
    my ($http_client, $response, $req, $method) = @_;
    if ($method eq 'SUBSCRIBE') {
        my $sid = $req->header('SID');
        if (!$sid) {
            $sid_n++;
            $sid = 'uuid:wiim-dlna-' . _uuid() . '-' . $sid_n;
            my $cb = $req->header('CALLBACK') || '';
            my ($url) = $cb =~ /<([^>]+)>/;
            $subs{$sid} = { url => $url || '' } if $url;
        }
        $response->code(200);
        $response->header('SID' => $sid);
        $response->header('TIMEOUT' => 'Second-300');
        $response->header('Content-Length' => 0);
        my $empty = '';
        Slim::Web::HTTP::addHTTPResponse($http_client, $response, \$empty);
        return;
    }
    if ($method eq 'UNSUBSCRIBE') {
        my $sid = $req->header('SID') || '';
        delete $subs{$sid} if $sid;
        $response->code(200);
        $response->header('Content-Length' => 0);
        my $empty = '';
        Slim::Web::HTTP::addHTTPResponse($http_client, $response, \$empty);
        return;
    }
    _http_text($http_client, $response, 412, 'text/plain', '');
}

sub _notify {
    return unless keys %subs;
    my $body = '<?xml version="1.0"?>'
        . '<e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0"><e:property><LastChange>'
        . _xml('<Event xmlns="urn:schemas-upnp-org:metadata-1-0/AVT/"><InstanceID val="0"><TransportState val="'
            . $session{transport} . '"/></InstanceID></Event>')
        . '</LastChange></e:property></e:propertyset>';
    for my $sid (keys %subs) {
        my $url = $subs{$sid}{url} || next;
        _send_notify($url, $sid, $body);
    }
}

sub _send_notify {
    my ($url, $sid, $body) = @_;
    my ($host, $port, $path) = $url =~ m{^https?://([^/:]+)(?::(\d+))?(/.*)?$}i;
    return unless $host;
    $port ||= 80;
    $path ||= '/';
    my $sock = IO::Socket::INET->new(
        PeerAddr => $host,
        PeerPort => $port,
        Proto    => 'tcp',
        Timeout  => 0.4,
        Blocking => 1,
    );
    return unless $sock;
    my $req = "NOTIFY $path HTTP/1.1\r\n"
        . "HOST: $host:$port\r\n"
        . "CONTENT-TYPE: text/xml; charset=\"utf-8\"\r\n"
        . "NT: upnp:event\r\n"
        . "NTS: upnp:propchange\r\n"
        . "SID: $sid\r\n"
        . "SEQ: 0\r\n"
        . "CONTENT-LENGTH: " . length($body) . "\r\n"
        . "CONNECTION: close\r\n\r\n"
        . $body;
    eval { print $sock $req };
    eval { $sock->close() };
}

sub _device_xml {
    my $base = _base();
    my $name = _xml(_friendly_name());
    my $uuid = _xml(_uuid());
    return <<"XML";
<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<device>
<deviceType>$DEV</deviceType>
<friendlyName>$name</friendlyName>
<manufacturer>Lyrion</manufacturer>
<manufacturerURL>https://lyrion.org/</manufacturerURL>
<modelDescription>WiiM stream redistribution</modelDescription>
<modelName>Wiim Integration</modelName>
<modelNumber>1.0.49</modelNumber>
<UDN>uuid:$uuid</UDN>
<serviceList>
<service>
<serviceType>$AVT</serviceType>
<serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
<SCPDURL>$base/plugins/WiimIntegration/dlna/avt.xml</SCPDURL>
<controlURL>$base/plugins/WiimIntegration/dlna/avt</controlURL>
<eventSubURL>$base/plugins/WiimIntegration/dlna/avt/event</eventSubURL>
</service>
<service>
<serviceType>$CM</serviceType>
<serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
<SCPDURL>$base/plugins/WiimIntegration/dlna/cm.xml</SCPDURL>
<controlURL>$base/plugins/WiimIntegration/dlna/cm</controlURL>
<eventSubURL>$base/plugins/WiimIntegration/dlna/cm/event</eventSubURL>
</service>
<service>
<serviceType>$RC</serviceType>
<serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
<SCPDURL>$base/plugins/WiimIntegration/dlna/rc.xml</SCPDURL>
<controlURL>$base/plugins/WiimIntegration/dlna/rc</controlURL>
<eventSubURL>$base/plugins/WiimIntegration/dlna/rc/event</eventSubURL>
</service>
</serviceList>
</device>
</root>
XML
}

sub _scpd_avt {
    return _scpd(
        [qw(SetAVTransportURI SetNextAVTransportURI GetMediaInfo GetTransportInfo GetPositionInfo GetDeviceCapabilities GetTransportSettings Stop Play Pause Seek Next Previous GetCurrentTransportActions)],
        [
            ['SetAVTransportURI', ['InstanceID', 'CurrentURI', 'CurrentURIMetaData'], []],
            ['Play', ['InstanceID', 'Speed'], []],
            ['Pause', ['InstanceID'], []],
            ['Stop', ['InstanceID'], []],
            ['GetTransportInfo', ['InstanceID'], [qw(CurrentTransportState CurrentTransportStatus CurrentSpeed)]],
        ]
    );
}

sub _scpd_cm {
    return _scpd(
        [qw(GetProtocolInfo GetCurrentConnectionIDs GetCurrentConnectionInfo)],
        [
            ['GetProtocolInfo', [], [qw(Source Sink)]],
        ]
    );
}

sub _scpd_rc {
    return _scpd(
        [qw(GetVolume SetVolume GetMute SetMute ListPresets)],
        [
            ['SetVolume', [qw(InstanceID Channel DesiredVolume)], []],
            ['GetVolume', [qw(InstanceID Channel)], ['CurrentVolume']],
        ]
    );
}

sub _scpd {
    my ($names, $detailed) = @_;
    my %done;
    my $actions = '';
    for my $spec (@$detailed) {
        my ($name, $in, $out) = @$spec;
        $done{$name} = 1;
        $actions .= "<action><name>$name</name><argumentList>";
        for my $arg (@$in) {
            $actions .= "<argument><name>$arg</name><direction>in</direction><relatedStateVariable>$arg</relatedStateVariable></argument>";
        }
        for my $arg (@$out) {
            $actions .= "<argument><name>$arg</name><direction>out</direction><relatedStateVariable>$arg</relatedStateVariable></argument>";
        }
        $actions .= "</argumentList></action>";
    }
    for my $name (@$names) {
        next if $done{$name};
        $actions .= "<action><name>$name</name><argumentList><argument><name>InstanceID</name><direction>in</direction><relatedStateVariable>A_ARG_TYPE_InstanceID</relatedStateVariable></argument></argumentList></action>";
    }
    my $vars = '';
    my %vars = (
        A_ARG_TYPE_InstanceID => 'ui4',
        CurrentURI => 'string',
        CurrentURIMetaData => 'string',
        TransportState => 'string',
        CurrentTransportState => 'string',
        CurrentTransportStatus => 'string',
        CurrentSpeed => 'string',
        Speed => 'string',
        InstanceID => 'ui4',
        Source => 'string',
        Sink => 'string',
        Channel => 'string',
        DesiredVolume => 'ui2',
        CurrentVolume => 'ui2',
    );
    for my $name (sort keys %vars) {
        $vars .= "<stateVariable sendEvents=\"no\"><name>$name</name><dataType>$vars{$name}</dataType></stateVariable>";
    }
    return <<"XML";
<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
<specVersion><major>1</major><minor>0</minor></specVersion>
<actionList>$actions</actionList>
<serviceStateTable>$vars</serviceStateTable>
</scpd>
XML
}

sub _soap_ok {
    my ($service, $action, $inner) = @_;
    return '<?xml version="1.0"?>'
        . '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
        . '<s:Body><u:' . $action . 'Response xmlns:u="' . $service . '">'
        . $inner
        . '</u:' . $action . 'Response></s:Body></s:Envelope>';
}

sub _soap_fault {
    my ($desc, $code) = @_;
    $desc = _xml($desc || 'Error');
    $code ||= 501;
    return '<?xml version="1.0"?>'
        . '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
        . '<s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail>'
        . '<UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>' . $code
        . '</errorCode><errorDescription>' . $desc . '</errorDescription></UPnPError>'
        . '</detail></s:Fault></s:Body></s:Envelope>';
}

sub _http_xml {
    my ($http_client, $response, $xml) = @_;
    _http_text($http_client, $response, 200, 'text/xml; charset="utf-8"', $xml);
}

sub _http_text {
    my ($http_client, $response, $code, $type, $body) = @_;
    $response->code($code);
    $response->content_type($type);
    $response->header('Content-Length' => length($body));
    $response->header('Server' => _server_token());
    Slim::Web::HTTP::addHTTPResponse($http_client, $response, \$body);
}

sub _friendly_name {
    # Prefer the explicit LMS server name. Otherwise use the name LMS shows
    # for itself: library name, then host name.
    my $server = eval { preferences('server')->get('serverName') } || '';
    $server =~ s/^\s+|\s+$//g;
    if ($server eq '') {
        $server = eval { Slim::Utils::Misc::getLibraryName() } || '';
        $server =~ s/^\s+|\s+$//g;
    }
    return $server ? "$server - Lyrion Music Server" : 'Lyrion Music Server';
}

sub _uuid {
    my $saved = $prefs->get('dlna_uuid') || '';
    return $saved if $saved =~ /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    require Digest::MD5;
    my $seed = (Slim::Utils::Network::hostAddr() || 'lyrion') . ':wiim-dlna-renderer';
    my $hex = Digest::MD5::md5_hex($seed);
    my $uuid = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    $prefs->set('dlna_uuid', $uuid);
    return $uuid;
}

sub _base {
    my $fn = $hook{base_url};
    my $url = $fn ? $fn->() : '';
    return $url if $url;
    my $port = eval { preferences('server')->get('httpport') } || 9000;
    my $ip = Slim::Utils::Network::hostAddr() || '127.0.0.1';
    return "http://$ip:$port";
}

sub _server_token {
    return 'Linux/3 UPnP/1.0 Lyrion-Wiim/1.0';
}

sub _hms {
    my $secs = int(shift || 0);
    $secs = 0 if $secs < 0;
    my $h = int($secs / 3600);
    my $m = int(($secs % 3600) / 60);
    my $s = $secs % 60;
    return sprintf('%02d:%02d:%02d', $h, $m, $s);
}

sub _xml {
    my $text = shift // '';
    $text =~ s/&/&amp;/g;
    $text =~ s/</&lt;/g;
    $text =~ s/>/&gt;/g;
    $text =~ s/"/&quot;/g;
    return $text;
}

sub _xml_decode {
    my $text = shift // '';
    $text =~ s/&lt;/</g;
    $text =~ s/&gt;/>/g;
    $text =~ s/&quot;/"/g;
    $text =~ s/&apos;/'/g;
    $text =~ s/&amp;/&/g;
    $text =~ s/^\s+|\s+$//g;
    return $text;
}

1;
