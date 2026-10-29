package Plugins::WiimIntegration::RelayProto;

use strict;
use warnings;

use URI::Escape qw(uri_escape_utf8);

use Slim::Utils::Log;

# Not a subclass of HTTP. That class scans the URL, then opens it with a
# blocking connect. The relay lives on this LMS, so that connect waits on
# itself and the player never starts. The player fetches the relay directly.

my $log = Slim::Utils::Log->addLogCategory({
    category     => 'plugin.wiim_integration',
    defaultLevel => 'INFO',
    description  => 'Wiim Integration',
});

sub isRemote    { 1 }
sub isAudio     { 1 }
sub isAudioURL  { 1 }
sub contentType { 'mp3' }
sub canSeek     { 0 }

# Not mp3. SqueezeDSP installs mp3-mp3-<player mac> with a lame|SqueezeDSP
# command, which is more specific than the stock "-" rule. Song::open then
# never asks for a direct URL and tries to open the stream on the server.
# wrel has no SqueezeDSP profile, so custom-convert.conf can keep command "-".
sub getFormatForURL { 'wrel' }
sub formatOverride  { 'wrel' }

sub canDirectStreamSong {
    my ($class, $client, $song) = @_;
    my $track = eval { $song->currentTrack->url } || '';
    my $stream = eval { $song->streamUrl } || '';
    return $class->canDirectStream($client, $track || $stream);
}

sub canDirectStream {
    my ($class, $client, $url) = @_;
    my $direct = $class->_playerUrl($client, $url);
    $log->warn("DLNA direct [$url] -> [$direct]");
    return $direct;
}

# The server must not open this URL. A blocking open of our own relay stalls LMS.
sub new {
    my ($class, $args) = @_;
    $log->error('DLNA refused a server-side open of ' . (($args && $args->{url}) || ''));
    return;
}

# Squeezelite sends this request itself. No ICY and no Range: the relay is a
# live MP3 body, and a Range request would not match what it answers.
sub requestString {
    my ($class, $client, $url) = @_;
    return '' unless $url;

    if ($url !~ m{^https?://}i) {
        $url = $class->_playerUrl($client, $url);
    }
    return '' unless $url && $url =~ m{^https?://}i;

    my ($host, $port, $path, undef, undef, $proxied) = Slim::Utils::Misc::crackURL($url);
    return '' unless $host && $path;
    $path = $proxied if $proxied;
    $port ||= 9000;
    my $hosthdr = ($port == 80 || $port eq '80') ? $host : "$host:$port";

    my $request = join("\r\n",
        "GET $path HTTP/1.0",
        "Host: $hosthdr",
        'Accept: */*',
        'Icy-MetaData: 0',
        'Connection: close',
        'User-Agent: Lyrion-Wiim',
    );
    return $request . "\r\n\r\n";
}

# Queries and the player screen only copy artwork, title and duration when the
# handler answers here. The values are the WiiM metadata Wiim Integration already
# stored. An empty hash is required: a missing return makes status cloning die.
sub getMetadataFor {
    my ($class, $client, $url) = @_;
    my $meta = eval { Plugins::WiimIntegration::Plugin::_relayDisplayMeta($url, $client) };
    return $meta if $meta && ref $meta eq 'HASH';
    return {};
}

# The player sends the relay's response headers back. metaint stays 0 because
# the relay already removed ICY; a non-zero value would eat audio bytes.
sub parseDirectHeaders {
    my ($class, $client, $url, @headers) = @_;
    my ($contentType, $length, $redir);

    for my $header (@headers) {
        $header =~ s/\0+$//;
        if ($header =~ /^Content-Type:\s*([^;\s]+)/i) {
            $contentType = $1;
        }
        elsif ($header =~ /^Content-Length:\s*(\d+)/i) {
            $length = $1;
        }
        elsif ($header =~ /^Location:\s*(\S+)/i) {
            $redir = $1;
        }
    }

    my $type = eval { Slim::Music::Info::mimeToType($contentType) } || '';
    $type = 'mp3' if !$type || $type eq 'wrel';
    $log->warn("DLNA headers type=$type length=" . (defined $length ? $length : ''));
    return (undef, undef, 0, ($redir || ''), $type, $length, undef);
}

sub _playerUrl {
    my ($class, $client, $url) = @_;
    return '' unless $url;

    if ($url =~ m{/plugins/WiimIntegration/relay\.mp3(?:\?|$)}i) {
        return $url;
    }

    my $id = '';
    if ($url =~ m{^wiimrelay://([0-9a-f:]+)}i) {
        $id = lc $1;
    }
    elsif ($url =~ m{^https?://([^/:]+)}i) {
        my $host = $1;
        $host =~ s/:\d+$//;
        for my $wiim (Plugins::WiimIntegration::Plugin::_allWiimClients()) {
            my $ip = eval { $wiim->ip() } || '';
            $ip =~ s/:\d+$//;
            next unless $ip && lc($ip) eq lc($host);
            $id = lc($wiim->id() || '');
            last;
        }
    }
    return '' unless $id;

    # The source WiiM already has this audio. Do not send it back.
    my $self_id = eval { lc($client->id() || '') } || '';
    return '' if $self_id && $self_id eq $id;

    my $base = eval { Plugins::WiimIntegration::Plugin::_lmsListenBaseUrl() } || '';
    return '' unless $base;
    return $base . '/plugins/WiimIntegration/relay.mp3?wiim=' . uri_escape_utf8($id);
}

1;
