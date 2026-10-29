package Plugins::WiimIntegration::PresetKeys;

use strict;
use warnings;

# Pure helpers for the WiiM PlayQueue KeyList. No Slim calls, so a
# standalone perl test can load this file. SetKeyMapping must send the
# whole list; these helpers replace one <KeyN> and leave every other
# byte as the device sent it.

my %_ENT = (
    amp  => '&',
    lt   => '<',
    gt   => '>',
    quot => '"',
    apos => "'",
);

sub editor_slots { 10 }

sub xml_escape {
    my $s = shift;
    $s = '' unless defined $s;
    $s =~ s/&/&amp;/g;
    $s =~ s/</&lt;/g;
    $s =~ s/>/&gt;/g;
    $s =~ s/"/&quot;/g;
    $s =~ s/'/&apos;/g;
    return $s;
}

# One XML text-node unescape. &amp;lt; stays &lt; because the replacement
# is not scanned again.
sub xml_text {
    my $s = shift;
    $s = '' unless defined $s;
    $s =~ s/&(amp|lt|gt|quot|apos);/$_ENT{$1}/ge;
    return $s;
}

sub queue_context_from_soap {
    my $soap = shift;
    return unless defined $soap && $soap =~ m{<QueueContext>(.*?)</QueueContext>}s;
    my $xml = xml_text($1);
    return $xml if $xml =~ /<KeyList>/;
    return;
}

sub soap_set_mapping {
    my $keylist = shift;
    $keylist = '' unless defined $keylist;
    my $esc = xml_escape($keylist);
    return qq{<?xml version="1.0"?>\n}
        . qq{<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n}
        . qq{<s:Body><u:SetKeyMapping xmlns:u="urn:schemas-wiimu-com:service:PlayQueue:1"><QueueContext>$esc</QueueContext></u:SetKeyMapping></s:Body>\n}
        . qq{</s:Envelope>\n};
}

sub clean_name {
    my $n = shift;
    $n = '' unless defined $n;
    $n =~ s/_#~\d+\s*$//;
    $n =~ s/^\s+|\s+$//g;
    return $n;
}

sub _pct_unescape {
    my $s = shift;
    $s = '' unless defined $s;
    $s =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
    return $s;
}

# LMS slot encoded in a bridge URL. Hardware key numbers are not this.
sub slot_from_url {
    my $url = shift;
    return unless defined $url && $url ne '';
    return if $url =~ /^unknow/i;
    if ($url =~ m{/preset/(\d+)(?:\.m3u)?(?:\?|#|$)}i) {
        return 0 + $1;
    }
    if ($url =~ m{/preset=(\d+)\.m3u(?:\?|#|$)}i) {
        return 0 + $1;
    }
    my $dec = _pct_unescape($url);
    if ($dec =~ /jsonrpc\.js/i && $dec =~ /button/i && $dec =~ /preset_(\d+)\.single/i) {
        return 0 + $1;
    }
    return;
}

# A stream we may copy into the Lyrion slot. LMS command URLs are not streams.
sub copyable_stream {
    my $url = shift;
    return 0 unless defined $url && $url ne '';
    return 0 if $url =~ /^unknow/i;
    return 0 if defined slot_from_url($url);
    return 0 unless $url =~ m{^https?://}i;
    return 0 if $url =~ m{/status\.html(?:\?|$)}i;
    return 0 if $url =~ m{/jsonrpc\.js(?:\?|$)}i;
    return 0 if $url =~ m{/(?:control|playback)/}i;
    return 0 if $url =~ m{/preset[/=]}i;
    return 1;
}

sub classify_fields {
    my %f = @_;
    my $name = clean_name($f{name});
    my $url  = defined $f{url} ? $f{url} : '';
    $url = '' if $url =~ /^unknow/i;
    my $source  = defined $f{source}  ? $f{source}  : '';
    my $pic     = defined $f{pic}     ? $f{pic}     : '';
    $pic = '' if $pic =~ /^unknow/i;
    my $routine = defined $f{routine} ? $f{routine} : '';
    my $routine_set = ($routine ne '' && $routine !~ /^empty$/i) ? 1 : 0;
    my $slot = ($url ne '') ? slot_from_url($url) : undef;

    my $kind;
    if (defined $slot) {
        $kind = 'local';
    }
    elsif ($name eq '' && $url eq '' && $source eq '' && $pic eq '' && !$routine_set) {
        $kind = 'empty';
    }
    else {
        $kind = 'remote';
    }

    my $src = $source;
    $src = 'routine' if $src eq '' && $routine_set;

    return {
        kind     => $kind,
        name     => $name,
        url      => $url,
        source   => $src,
        pic      => $pic,
        routine  => $routine,
        lms_slot => $slot || 0,
        copyable => ($kind eq 'remote' && copyable_stream($url)) ? 1 : 0,
    };
}

sub _tag {
    my ($body, $tag) = @_;
    return '' unless defined $body && $body =~ m{<\Q$tag\E>(.*?)</\Q$tag\E>}s;
    return xml_text($1);
}

sub parse_key_list {
    my $xml = shift;
    $xml = '' unless defined $xml;
    my %keys;
    while ($xml =~ m{<Key(\d+)>(.*?)</Key\1>}sg) {
        my ($n, $body) = ($1, $2);
        next if $n == 0;
        my $info = classify_fields(
            name    => _tag($body, 'Name'),
            url     => _tag($body, 'Url'),
            source  => _tag($body, 'Source'),
            pic     => _tag($body, 'PicUrl'),
            routine => _tag($body, 'RoutineId'),
        );
        $info->{number} = 0 + $n;
        $keys{0 + $n} = $info;
    }
    return \%keys;
}

# $element is a full <KeyN>...</KeyN> at KeyList level (Metadata still escaped).
sub replace_key {
    my ($xml, $num, $element) = @_;
    $xml = '' unless defined $xml;
    my $n = int($num || 0);
    return $xml unless $n > 0 && defined $element;
    my $re = qr{<Key$n>.*?</Key$n>}s;
    if ($xml =~ $re) {
        substr($xml, $-[0], $+[0] - $-[0], $element);
        return $xml;
    }
    if ($xml =~ m{</KeyList>}) {
        substr($xml, $-[0], 0, $element . "\n");
    }
    return $xml;
}

# Replace the visible name of one existing <KeyN>. The URL and every other
# key stay byte for byte. Metadata is escaped once, so dc:title / song:id
# text inside it is escaped twice.
sub patch_local_name {
    my ($xml, $num, $title) = @_;
    $xml = '' unless defined $xml;
    my $n = int($num || 0);
    return $xml unless $n > 0;
    $title = clean_name($title);
    $title =~ s/[\r\n\t]+/ /g;
    $title = substr($title, 0, 80) if length($title) > 80;
    return $xml if $title eq '';
    my $re = qr{<Key$n>.*?</Key$n>}s;
    return $xml unless $xml =~ $re;
    my ($start, $len) = ($-[0], $+[0] - $-[0]);
    my $el = substr($xml, $start, $len);
    return $xml unless $el =~ m{<Name>.*?</Name>}s;

    my $stamp = time();
    $stamp =~ s/\..*$//;
    my $name = $title . '_#~' . $stamp;
    $el = _replace_between($el, '<Name>', '</Name>', xml_escape($name));
    my $once  = xml_escape($title);
    my $twice = xml_escape($once);
    my $id_twice = xml_escape(xml_escape($name));
    $el = _replace_between($el, '&lt;dc:title&gt;', '&lt;/dc:title&gt;', $twice);
    $el = _replace_between($el, '&lt;song:id&gt;', '&lt;/song:id&gt;', $id_twice);
    substr($xml, $start, $len, $el);
    return $xml;
}

sub _replace_between {
    my ($xml, $open, $close, $inner) = @_;
    my $from = index($xml, $open);
    return $xml if $from < 0;
    my $content_at = $from + length($open);
    my $to = index($xml, $close, $content_at);
    return $xml if $to < 0;
    substr($xml, $content_at, $to - $content_at, $inner);
    return $xml;
}

sub local_key_xml {
    my ($num, $title, $url) = @_;
    my $n = int($num || 0);
    $title = clean_name($title);
    $title = "Preset $n" if $title eq '';
    $title =~ s/[\r\n\t]+/ /g;
    $title = substr($title, 0, 80) if length($title) > 80;
    my $stamp = time();
    $stamp =~ s/\..*$//;
    my $name = $title . '_#~' . $stamp;
    my $didl = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:song="www.linkplay.com/song/" xmlns:custom="www.linkplay.com/custom/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
        . '<upnp:class>object.item.audioItem.musicTrack</upnp:class><item><res protocolInfo="http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;" duration="">'
        . xml_escape($url)
        . '</res><song:id>' . xml_escape($name) . '</song:id><dc:title>' . xml_escape($title) . '</dc:title>'
        . '<upnp:artist></upnp:artist><upnp:album></upnp:album></item></DIDL-Lite>';
    return "<Key$n>\n"
        . '<Name>' . xml_escape($name) . "</Name>\n"
        . '<Url>' . xml_escape($url) . "</Url>\n"
        . '<Metadata>' . xml_escape($didl) . "</Metadata>\n"
        . "<Source>CustomRadio</Source>\n"
        . "<RoutineId>Empty</RoutineId>\n"
        . "<ContentType>radio</ContentType>\n"
        . "<Loop>0</Loop>\n"
        . "<Shuffle>0</Shuffle>\n"
        . "</Key$n>";
}

1;
