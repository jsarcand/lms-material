package Plugins::WiimIntegration::UPnPHelper;

use strict;
use warnings;

use IO::Socket::INET;
use URI::Escape qw(uri_escape_utf8 uri_unescape);

use Slim::Networking::Async::HTTP;
use Slim::Networking::IO::Select qw(addRead removeRead);
use Slim::Networking::SimpleAsyncHTTP;
use Slim::Utils::Log;
use Slim::Utils::Network;
use Slim::Utils::Timers;

my $log = Slim::Utils::Log->addLogCategory({
    category     => 'plugin.wiim_integration.upnp',
    defaultLevel => 'INFO',
    description  => 'Wiim Integration UPnP',
});

# mac => { ip, event_url, sid, expire }
my %subs;
my $eventCb;
my $notifySock;
my $notifyPort;

sub setHandler {
    $eventCb = shift;
}

sub subscribe {
    my $client = shift || return;
    my $ip = _host($client) || return;
    my $mac = lc($client->id() || '') || return;

    _ensureNotifyServer() or return;

    $subs{$mac}{ip} = $ip;
    $subs{$mac}{client_id} = $mac;

    _fetchEventUrl($ip, sub {
        my $event_url = shift || "http://$ip:49152/upnp/event/rendertransport1";
        $subs{$mac}{event_url} = $event_url;
        _doSubscribe($client, $mac, $event_url, 0);
    });
}

sub unsubscribe {
    my $client = shift || return;
    my $mac = lc($client->id() || '') || return;
    my $sub = delete $subs{$mac} || return;
    Slim::Utils::Timers::killTimers($client, \&_renewSubscribe);
    return unless $sub->{sid} && $sub->{event_url};

    eval { require HTTP::Request; 1; };
    return unless $INC{'HTTP/Request.pm'};
    my $req = HTTP::Request->new(UNSUBSCRIBE => $sub->{event_url});
    _hostHeader($req, $sub->{event_url});
    $req->header('SID' => $sub->{sid});
    _sendUpnp($req, sub {}, sub {});
}

sub _playQueue {
    my ($client, $action, $soap, $cb) = @_;
    my $ip = _host($client);
    unless ($ip) {
        $cb && $cb->(undef);
        return;
    }
    my $ns = 'urn:schemas-wiimu-com:service:PlayQueue:1';
    my $http = Slim::Networking::SimpleAsyncHTTP->new(
        sub {
            my $content = shift->content;
            $cb && $cb->($content);
        },
        sub { $cb && $cb->(undef) },
        { timeout => 8 }
    );
    $http->post(
        "http://$ip:49152/upnp/control/PlayQueue1",
        'SOAPACTION'   => "\"$ns#$action\"",
        'Content-Type' => 'text/xml; charset="utf-8"',
        $soap
    );
}

sub getKeyMapping {
    my ($client, $cb) = @_;
    my $ns = 'urn:schemas-wiimu-com:service:PlayQueue:1';
    my $soap = qq{<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:GetKeyMapping xmlns:u="$ns"></u:GetKeyMapping></s:Body>
</s:Envelope>
};
    _playQueue($client, 'GetKeyMapping', $soap, $cb);
}

sub setKeyMapping {
    my ($client, $soap, $cb) = @_;
    _playQueue($client, 'SetKeyMapping', $soap, sub {
        my $content = shift;
        return $cb && $cb->(0) unless defined $content;
        return $cb && $cb->(0) if $content =~ /<(?:\w+:)?Fault[\s>]/i;
        $cb && $cb->(1);
    });
}

sub getStatus {
    my ($client, $cb) = @_;
    my $ip = _host($client) || return $cb->(undef);

    my $soap = <<'XML';
<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:GetInfoEx xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:GetInfoEx></s:Body>
</s:Envelope>
XML

    my $http = Slim::Networking::SimpleAsyncHTTP->new(
        sub {
            my $content = shift->content;
            $cb->(_parseSoapOrNotify($content));
        },
        sub { $cb->(undef) },
        { timeout => 4 }
    );

    $http->post(
        "http://$ip:49152/upnp/control/rendertransport1",
        'SOAPACTION'   => '"urn:schemas-upnp-org:service:AVTransport:1#GetInfoEx"',
        'Content-Type' => 'text/xml; charset="utf-8"',
        $soap
    );
}

sub _host {
    my $client = shift || return;
    my $ip = eval { $client->ip() } || return;
    $ip =~ s/:\d+$//;
    return $ip;
}

sub _ensureNotifyServer {
    return $notifyPort if $notifyPort && $notifySock;
    $notifySock = IO::Socket::INET->new(
        LocalAddr => '0.0.0.0',
        LocalPort => 0,
        Listen    => 16,
        ReuseAddr => 1,
        Proto     => 'tcp',
        Blocking  => 0,
    );
    unless ($notifySock) {
        $log->warn("UPnP notify listen failed: $!");
        return;
    }
    $notifyPort = $notifySock->sockport;
    addRead($notifySock, \&_acceptNotify);
    $log->info("UPnP notify listener on port $notifyPort");
    return $notifyPort;
}

sub _callbackUrl {
    my $mac = shift;
    my $ip  = Slim::Utils::Network::hostAddr() || '127.0.0.1';
    return "http://$ip:$notifyPort/wiim-upnp?mac=" . uri_escape_utf8($mac || '');
}

sub _fetchEventUrl {
    my ($ip, $cb) = @_;
    my $http = Slim::Networking::SimpleAsyncHTTP->new(
        sub {
            my $xml = shift->content || '';
            my $url;
            # Prefer AVTransport eventSubURL
            if ($xml =~ m{AVTransport.*?<eventSubURL>\s*([^<]+)\s*</eventSubURL>}si
                || $xml =~ m{<eventSubURL>\s*([^<]*AVTransport[^<]*)\s*</eventSubURL>}si
                || $xml =~ m{<eventSubURL>\s*([^<]+)\s*</eventSubURL>}si) {
                $url = $1;
                $url =~ s/^\s+|\s+$//g;
            }
            if ($url && $url !~ m{^https?://}i) {
                $url = ($url =~ m{^/} ? "http://$ip:49152$url" : "http://$ip:49152/$url");
            }
            $cb->($url);
        },
        sub { $cb->(undef) },
        { timeout => 4 }
    );
    $http->get("http://$ip:49152/description.xml");
}

sub _doSubscribe {
    my ($client, $mac, $event_url, $renew) = @_;
    return unless $event_url && $notifyPort;
    eval { require HTTP::Request; 1; };
    unless ($INC{'HTTP/Request.pm'}) {
        $log->warn('HTTP::Request missing — UPnP SUBSCRIBE skipped, GetInfoEx poll still used');
        return;
    }

    my $req = HTTP::Request->new(SUBSCRIBE => $event_url);
    _hostHeader($req, $event_url);
    $req->header('TIMEOUT' => 'Second-300');
    if ($renew && $subs{$mac}{sid}) {
        $req->header('SID' => $subs{$mac}{sid});
    }
    else {
        $req->header('CALLBACK' => '<' . _callbackUrl($mac) . '>');
        $req->header('NT' => 'upnp:event');
    }

    _sendUpnp($req, sub {
        my $res = shift || return;
        my $sid = $res->header('SID') || $subs{$mac}{sid};
        my $to  = $res->header('TIMEOUT') || 'Second-300';
        my ($secs) = $to =~ /(\d+)/;
        $secs ||= 300;
        $subs{$mac}{sid}       = $sid if $sid;
        $subs{$mac}{event_url} = $event_url;
        $subs{$mac}{expire}    = time() + $secs;
        $log->info(($renew ? 'Renewed' : 'Subscribed') . " AVTransport on $mac SID=" . ($sid || '?'));
        Slim::Utils::Timers::killTimers($client, \&_renewSubscribe);
        my $when = $secs > 80 ? $secs - 60 : int($secs / 2) || 30;
        Slim::Utils::Timers::setTimer($client, time() + $when, \&_renewSubscribe, $client);
    }, sub {
        my $err = shift || 'error';
        $log->warn("UPnP SUBSCRIBE failed for $mac: $err");
        # Retry once with the other common Linkplay path
        if (!$renew && $event_url !~ /rendertransport1/) {
            _doSubscribe($client, $mac, "http://" . ($subs{$mac}{ip} || '') . ":49152/upnp/event/rendertransport1", 0);
        }
    });
}

sub _renewSubscribe {
    my $client = shift || return;
    my $mac = lc($client->id() || '') || return;
    my $sub = $subs{$mac} || return;
    _doSubscribe($client, $mac, $sub->{event_url}, 1);
}

sub _hostHeader {
    my ($req, $url) = @_;
    if ($url =~ m{^https?://([^/]+)}i) {
        $req->header('HOST' => $1);
    }
}

sub _sendUpnp {
    my ($request, $ok_cb, $err_cb) = @_;
    my $http = Slim::Networking::Async::HTTP->new;
    $http->send_request({
        request     => $request,
        Timeout     => 8,
        onError     => sub {
            my ($h, $error) = @_;
            $err_cb && $err_cb->($error || 'http error');
        },
        onBody      => sub {
            my $h = shift;
            $ok_cb && $ok_cb->($h->response);
        },
    });
}

sub _acceptNotify {
    my $ls = shift;
    my $cs = eval { $ls->accept() } || return;
    $cs->blocking(0);
    ${*$cs}{rbuf} = '';
    addRead($cs, \&_readNotify);
}

sub _closeNotify {
    my $sock = shift || return;
    removeRead($sock);
    eval { $sock->close() };
}

sub _readNotify {
    my $sock = shift;
    my $n = sysread($sock, my $chunk, 16384);
    if (!defined $n || $n == 0) {
        _closeNotify($sock);
        return;
    }
    ${*$sock}{rbuf} .= $chunk;
    my $buf = ${*$sock}{rbuf};
    if (length($buf) > 256000) {
        _closeNotify($sock);
        return;
    }
    return unless $buf =~ /\r\n\r\n/;
    my ($headers, $body) = split(/\r\n\r\n/, $buf, 2);
    my ($cl) = $headers =~ /Content-Length:\s*(\d+)/i;
    $cl = 0 unless defined $cl;
    return if length($body) < $cl;

    eval {
        $sock->syswrite("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    };
    _closeNotify($sock);

    my ($path) = $headers =~ m{^(?:NOTIFY|POST)\s+(\S+)}i;
    my $mac = '';
    if ($path && $path =~ /[?&]mac=([^&\s]+)/i) {
        $mac = lc(uri_unescape($1));
        $mac =~ s/%3A/:/gi;
    }
    my $parsed = _parseSoapOrNotify(substr($body, 0, $cl));
    return unless $parsed && $eventCb;
    $eventCb->($mac, $parsed);
}

sub _unescapeXml {
    my $s = shift // '';
    $s =~ s/&lt;/</g;
    $s =~ s/&gt;/>/g;
    $s =~ s/&quot;/"/g;
    $s =~ s/&apos;/'/g;
    $s =~ s/&amp;/&/g;
    return $s;
}

sub _attrOrText {
    my ($xml, $tag) = @_;
    return $1 if $xml =~ m{<$tag\b[^>]*\bval="([^"]*)"}i;
    return $1 if $xml =~ m{<$tag\b[^>]*>([^<]*)</$tag>}i;
    return '';
}

sub _parseDidl {
    my $didl = shift || '';
    $didl = _unescapeXml($didl);
    my ($title)  = $didl =~ /dc:title>([^<]+)/;
    my ($artist) = $didl =~ /(?:upnp:artist|dc:creator)>([^<]+)/;
    my ($album)  = $didl =~ /(?:upnp:album)>([^<]+)/;
    my ($cover)  = $didl =~ /albumArtURI[^>]*>([^<]+)/;
    my ($trackid)= $didl =~ /song:id>([^<]+)/;
    my $source = '';
    $source = 'Spotify' if $didl =~ /spotify:/i;
    $source = 'AirPlay' if !$source && $didl =~ /airplay/i;
    $source = 'TIDAL'   if !$source && $didl =~ /tidal/i;
    $source = 'Qobuz'   if !$source && $didl =~ /qobuz/i;
    return {
        title   => $title   || '',
        artist  => $artist  || '',
        album   => $album   || '',
        cover   => $cover   || '',
        trackid => $trackid || '',
        source  => $source,
    };
}

sub _parseSoapOrNotify {
    my $xml = shift || return;
    $xml = _unescapeXml($xml);

    my $transport = _attrOrText($xml, 'CurrentTransportState')
        || _attrOrText($xml, 'TransportState')
        || '';
    $transport = lc($transport);

    my $didl = _attrOrText($xml, 'CurrentTrackMetaData')
        || _attrOrText($xml, 'AVTransportURIMetaData')
        || '';
    if (!$didl && $xml =~ /<TrackMetaData>(.*)<\/TrackMetaData>/s) {
        $didl = $1;
    }
    my $meta = _parseDidl($didl || $xml);

    my $source = $meta->{source} || '';
    $source ||= _attrOrText($xml, 'TrackSource') || _attrOrText($xml, 'PlayMedium') || '';
    $source = 'Spotify' if $source =~ /spotify/i;
    $source = 'AirPlay' if $source =~ /airplay/i;

    my $placeholder = qr{^(?:unknown|n/?a|none|null|un_?known|not\s*available|sans\s*titre|-)$}i;
    for my $k (qw(title artist album)) {
        my $v = $meta->{$k} // '';
        $v =~ s/^\s+|\s+$//g;
        $meta->{$k} = ($v eq '' || $v =~ $placeholder) ? '' : $v;
    }
    if (my $c = $meta->{cover}) {
        $c =~ s/^\s+|\s+$//g;
        $meta->{cover} = ($c =~ m{^(?:https?://|/)}i) ? $c : '';
    }

    return {
        title     => $meta->{title},
        artist    => $meta->{artist},
        album     => $meta->{album},
        cover     => $meta->{cover},
        trackid   => $meta->{trackid},
        source    => $source,
        transport => $transport,
        status    => ($transport =~ /play/ ? 'play' : $transport =~ /pause/ ? 'pause' : $transport),
        external  => 1,
    };
}

1;
