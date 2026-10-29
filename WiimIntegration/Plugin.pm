package Plugins::WiimIntegration::Plugin;

use strict;
use warnings;

use parent qw(Slim::Plugin::Base);

use Slim::Utils::Log;
use Slim::Utils::Prefs;
use Slim::Utils::Timers;
use Slim::Buttons::Common;
use Time::HiRes qw(time);
use Digest::MD5 qw(md5_hex);
use JSON::XS::VersionOneAndTwo;
use URI::Escape qw(uri_escape_utf8);
use File::Slurp qw(read_file write_file);
use File::Spec;
use Socket qw(PF_INET SOCK_STREAM SOL_SOCKET SO_ERROR inet_aton pack_sockaddr_in);
use Fcntl qw(F_GETFL F_SETFL O_NONBLOCK);
use Errno qw(EINPROGRESS EWOULDBLOCK EAGAIN EINTR);

use Slim::Networking::SimpleAsyncHTTP;
use Slim::Web::HTTP;
use Slim::Web::Pages;
use Slim::Player::Client;
use Slim::Control::Request;
use Slim::Utils::Network;
use Slim::Utils::Strings qw(string);
use Slim::Utils::Favorites;

use Plugins::WiimIntegration::UPnPHelper;
use Plugins::WiimIntegration::DlnaRenderer;
use Plugins::WiimIntegration::RelayProto;
use Plugins::WiimIntegration::PresetKeys;
use Plugins::WiimIntegration::Settings;

my $log = Slim::Utils::Log->addLogCategory({
    category     => 'plugin.wiim_integration',
    defaultLevel => 'INFO',
    description  => 'Wiim Integration',
});

my $prefs = preferences('plugin.wiim_integration');

$prefs->init({
    enabled          => 1,
    polling_interval => 4,
    enable_upnp      => 1,
    # Kept so older prefs files still load. Popups are not used: they block
    # the Squeezebox Radio. External playback is a normal remote-stream status.
    enable_overlay   => 0,
    wiim_devices     => [],
    shuffle_presets  => [1, 3, 5],
    dlna_targets     => [],
});

# Require this many consecutive external-mode polls before injecting status
# (avoids Wi-Fi getPlayerStatus blips wiping a real LMS queue).
my $EXTERNAL_CONFIRM_POLLS = 3;
# Mode 1 (Network) and idle AirPlay need extra polls — they flicker during
# Bluetooth → Wi-Fi/LMS with the physical source button.
my $AMBIGUOUS_CONFIRM_POLLS = 3;
# Ignore residual BT / fake Network-AirPlay this long after committing to LMS
# (hardware source button, /control/source/wifi, playlist takeover).
my $LMS_COMMIT_HOLD = 20;
# After LMS play drops (buffer / false Connect inject) keep treating the speaker
# as the LMS renderer so mode 34 cannot bounce the queue for a few seconds.
my $LMS_RENDERER_HOLD = 6;
# After an explicit Lyrion power-off, ignore a WiiM that is still reporting
# the old stream so stop+standby can land. A later play is followed without
# requiring the player to be powered back on.
my $POWER_OFF_QUIET = 8;

my %playerState;
my %ipToMac;
my %lastPresetTrigger;

my $statusHandler;
my $statusWrapperInstalled;
my $playlistMutatorWrapperInstalled;
my $originalServerStatus;
my $originalPower;
my $originalMixerVolume;
my $originalMixerMuting;
my $originalPlaylistJump;
my $originalButton;
my $originalPlay;
my $originalPause;
my $originalPlaylistControl;
my $originalPlaylistLoadTracks;
my $originalPlaylistAddTracks;
my $originalPlaylistPlayTracks;
my $originalMaterialSkin;
my $materialSkinWrapperInstalled;

my %EXTERNAL_MODES = (
    # mode 1 = network/app stream on many WiiM firmwares (AirPlay, etc. — not always 34)
    1  => 'Network',
    4  => 'Line In',
    5  => 'Bluetooth Input',
    6  => 'Optical Input',
    31 => 'Spotify',
    32 => 'TIDAL',
    34 => 'AirPlay',
    36 => 'Qobuz',
    40 => 'Line In',
    41 => 'Bluetooth Input',
    43 => 'Optical Input',
    44 => 'RCA Input',
    47 => 'Roon',
    49 => 'HDMI Input',
    60 => 'Line In',
    99 => 'External',
);

# Analog/digital inputs — always treated as live streams in LMS (no track metadata).
my %LIVE_INPUT_MODES = map { $_ => 1 } qw(4 5 6 40 41 43 44 49 60);

# switchmode cmd → primary WiiM mode number (for optimistic UI after source change).
my %SOURCE_CMD_MODE = (
    'bluetooth' => 41,
    'line-in'   => 40,
    'optical'   => 43,
    'hdmi'      => 49,
    'tv'        => 49,
);

# Placeholder strings WiiM returns when no real metadata is available.
my $META_PLACEHOLDER_RE = qr{^(?:unknown|n/?a|none|null|un_?known|not\s*available|sans\s*titre|-)$}i;

# Full catalog. Menus show only the jacks _capsForProject allows.
# hdmi is HDMI ARC. There is no separate TV jack; `tv` is accepted as an alias.
my @SOURCE_MODES = (
    { label => 'Bluetooth', cmd => 'bluetooth', icon_id => 'MTL_svg_speaker-bluetooth' },
    { label => 'Line In',   cmd => 'line-in',   icon_id => 'MTL_icon_input' },
    { label => 'Optical',   cmd => 'optical',   icon_id => 'MTL_icon_settings_input_component' },
    { label => 'HDMI ARC',  cmd => 'hdmi',      icon_id => 'MTL_icon_settings_input_hdmi' },
    { label => 'Wi-Fi',     cmd => 'wifi',      icon_id => 'MTL_icon_wifi' },
);

# setAudioOutputHardwareMode: 1 optical, 2 analog, 3 coax.
# Powered speakers (hardware 7 = internal speaker) get an empty list.
my @LINEOUT_MODES = (
    { label => 'SPDIF',          cmd => '1', icon_id => 'MTL_icon_settings_input_component' },
    { label => 'Line Out (AUX)', cmd => '2', icon_id => 'MTL_icon_cable' },
    { label => 'Coax',           cmd => '3', icon_id => 'MTL_icon_settings_input_composite' },
);

sub getDisplayName { 'PLUGIN_WIIMINTEGRATION' }
sub getVersion     { '1.0.49' }

# project / priv_prj from getStatusEx. Longer names are tested first.
# Unknown projects keep the streamer jacks and omit HDMI, which the bitmask
# advertises on models that do not have the port.
sub _capsForProject {
    my $project = lc(shift || '');
    $project =~ s/[^a-z0-9]+/_/g;

    return _caps('WiiM Pro Plus', [qw(bluetooth line-in optical wifi)], [qw(1 2 3)])
        if $project =~ /pro_plus/;
    return _caps('WiiM Amp Ultra', [qw(bluetooth line-in optical hdmi wifi)], [])
        if $project =~ /amp/ && $project =~ /ultra/;
    return _caps('WiiM Amp Pro', [qw(bluetooth line-in optical hdmi wifi)], [])
        if $project =~ /amp/ && $project =~ /pro/;
    return _caps('WiiM Amp', [qw(bluetooth line-in optical hdmi wifi)], [])
        if $project =~ /amp/;
    return _caps('WiiM Ultra', [qw(bluetooth line-in optical hdmi wifi)], [qw(1 2 3)])
        if $project =~ /ultra/;
    return _caps('WiiM Mini', [qw(bluetooth line-in wifi)], [qw(1 2)])
        if $project =~ /mini/;
    return _caps('WiiM Sound', [qw(bluetooth line-in wifi)], [])
        if $project =~ /sound/;
    return _caps('Audio Pro A10', [qw(bluetooth line-in wifi)], [], 'AUX')
        if $project =~ /a10/;
    return _caps('Audio Pro C10', [qw(bluetooth line-in wifi)], [])
        if $project =~ /c10/;
    return _caps('WiiM Pro', [qw(bluetooth line-in optical wifi)], [qw(1 2 3)])
        if $project =~ /(?:^|_)pro(?:_|$)/;

    return _caps('WiiM', [qw(bluetooth line-in optical wifi)], [qw(1 2 3)], '', 1);
}

sub _caps {
    my ($label, $inputs, $outputs, $line_label, $unknown) = @_;
    return {
        label      => $label,
        inputs     => $inputs,
        outputs    => $outputs || [],
        line_label => $line_label || '',
        unknown    => $unknown ? 1 : 0,
    };
}

sub _clientCaps {
    my $client = shift;
    my $project = '';
    if ($client && $client->id()) {
        $project = $playerState{$client->id()}{project} || '';
        _refreshModel($client) unless $project;
    }
    return _capsForProject($project);
}

sub _refreshModel {
    my $client = shift || return;
    my $id = $client->id() || return;
    return if $playerState{$id}{project};
    return if $playerState{$id}{model_busy};
    my $retry = $playerState{$id}{model_retry_at} || 0;
    return if $retry && time() < $retry;

    $playerState{$id}{model_busy} = 1;
    apiCall($client, 'getStatusEx', sub {
        delete $playerState{$id}{model_busy};
        my $data = shift;
        my $project = '';
        if ($data && ref $data eq 'HASH') {
            $project = $data->{project} || $data->{priv_prj} || $data->{project_build_name} || '';
        }
        unless ($project ne '') {
            $playerState{$id}{model_retry_at} = time() + 30;
            return;
        }
        delete $playerState{$id}{model_retry_at};
        $playerState{$id}{project} = $project;
        my $caps = _capsForProject($project);
        my $outputs = @{$caps->{outputs}} ? join(',', @{$caps->{outputs}}) : 'none';
        my $msg = 'WiiM model ' . ($client->name() || $id)
            . ": $project → $caps->{label} inputs="
            . join(',', @{$caps->{inputs}}) . " outputs=$outputs";
        if ($caps->{unknown}) {
            $log->warn("$msg (HDMI hidden until this project is catalogued)");
        }
        else {
            $log->info($msg);
        }
    });
}

sub _sourceModes {
    my $client = shift;
    my $caps = _clientCaps($client);
    my %want = map { $_ => 1 } @{$caps->{inputs} || []};
    my @out;
    for my $item (@SOURCE_MODES) {
        next unless $want{$item->{cmd}};
        if ($caps->{line_label} && $item->{cmd} eq 'line-in') {
            push @out, { %$item, label => $caps->{line_label} };
        }
        else {
            push @out, $item;
        }
    }
    return @out;
}

sub _lineoutModes {
    my $client = shift;
    my $caps = _clientCaps($client);
    my %want = map { $_ => 1 } @{$caps->{outputs} || []};
    return grep { $want{$_->{cmd}} } @LINEOUT_MODES;
}
sub modeName       { __PACKAGE__ }

# True when the user deliberately powered the player off in LMS/Lyrion.
# While set we must not force power=1 / external Now Playing into status replies.
sub _userPowerOff {
    my $client_or_id = shift || return 0;
    my $id = ref $client_or_id ? $client_or_id->id() : $client_or_id;
    return 0 unless $id;
    return $playerState{$id}{user_power_off} ? 1 : 0;
}

sub _setUserPowerOff {
    my ($client, $off) = @_;
    return unless $client;
    my $id = $client->id() || return;
    if ($off) {
        # A repeated power-0 must not restart the quiet window, or a WiiM
        # that starts playing while Lyrion is off would never be followed.
        unless ($playerState{$id}{user_power_off}) {
            $playerState{$id}{power_off_at} = time();
            delete $playerState{$id}{power_off_seen_idle};
        }
        $playerState{$id}{user_power_off} = 1;
    }
    else {
        delete $playerState{$id}{user_power_off};
        delete $playerState{$id}{power_off_at};
        delete $playerState{$id}{power_off_seen_idle};
    }
}

# True once stop+standby has had time to land. The idle flag is the caller's
# previous poll: the same response that first reports "stop" must not also
# count as a new playback.
sub _powerOffGraceOver {
    my $id = shift // '';
    my $at = $playerState{$id}{power_off_at} || 0;
    return $at && (time() - $at) >= $POWER_OFF_QUIET ? 1 : 0;
}

sub _notePowerOffIdle {
    my ($id, $status_str) = @_;
    return unless $id && _userPowerOff($id);
    my $st = lc($status_str // '');
    return unless $st eq '' || $st eq 'stop' || $st eq 'stopped' || $st eq 'none';
    $playerState{$id}{power_off_seen_idle} = 1;
}

# Play or pause on the device. A leftover mode number (Spotify stopped, or
# Bluetooth still selected after standby) must not turn the Lyrion UI back on.
sub _devicePlaybackActive {
    my ($status) = @_;
    return 0 unless $status && ref $status eq 'HASH';
    my $st = lc($status->{status} // '');
    return ($st eq 'play' || $st eq 'pause' || $st eq 'paused') ? 1 : 0;
}

# Whether external status may be presented as On/playing in the UI.
sub _canPresentExternal {
    my ($client, $state) = @_;
    return 0 unless $client;
    $state ||= $playerState{$client->id()} || {};
    return 0 if $state->{user_power_off};
    # Standby often drops squeezelite. A fresh WiiM poll may still be shown.
    if ($client->disconnected) {
        my $at = $state->{poll_ok_at} || 0;
        return 0 unless $state->{is_external} && $at && (time() - $at) < 30;
    }
    return 1;
}

sub isWiimPlayer {
    my $client = shift || return 0;
    my $model  = $client->modelName() || '';
    my $name   = $client->name()      || '';

    if ($model =~ /WiiM/i || $name =~ /wiim/i) {
        return 1;
    }

    my $prefModel = eval {
        Slim::Utils::Prefs::preferences('server')->client($client)->get('modelName') || ''
    } || '';
    return ($prefModel =~ /WiiM/i) ? 1 : 0;
}

sub condition {
    my ($class, $client) = @_;
    return $client && isWiimPlayer($client);
}

sub _decodeWiimField {
    my $val = shift;
    return '' unless defined $val && $val ne '';
    return $val if $val =~ /[^0-9A-Fa-f]/;
    return $val if length($val) < 4 || length($val) % 2;

    my $decoded = eval { pack('H*', $val) };
    return $val unless defined $decoded && $decoded =~ /\S/;

    utf8::decode($decoded);
    return $decoded;
}

sub _isPlaceholderMeta {
    my $val = shift;
    return 1 unless defined $val;
    $val =~ s/^\s+|\s+$//g;
    return 1 if $val eq '';
    return 1 if $val =~ $META_PLACEHOLDER_RE;
    return 0;
}

sub _cleanMetaField {
    my $val = shift // '';
    return '' if _isPlaceholderMeta($val);
    return $val;
}

sub _cleanCover {
    my $cover = shift // '';
    $cover =~ s/^\s+|\s+$//g;
    return '' if _isPlaceholderMeta($cover);
    return '' unless $cover =~ m{^(?:https?://|/)}i;
    return $cover;
}

sub _normalizeStatus {
    my $status = shift;
    return unless $status && ref $status eq 'HASH';

    $status->{title}  = _cleanMetaField(_decodeWiimField($status->{title}  // $status->{Title}  // ''));
    $status->{artist} = _cleanMetaField(_decodeWiimField($status->{artist} // $status->{Artist} // ''));
    $status->{album}  = _cleanMetaField(_decodeWiimField($status->{album}  // $status->{Album}  // ''));
    $status->{status} = lc($status->{status} // '');
    $status->{vendor} = $status->{vendor} // '';

    for my $key (qw(cover albumarturi albumArtURI pic_url PicUrl)) {
        next unless defined $status->{$key};
        $status->{$key} = _cleanCover($status->{$key});
    }

    return $status;
}

sub _isLiveInputMode {
    my $mode = shift // '';
    $mode =~ s/\D//g;
    return $LIVE_INPUT_MODES{$mode} ? 1 : 0;
}

# True external sources only (whitelist + active network stream).
# Avoid the old "mode > 10 + any metadata" catch-all (false AirPlay over LMS queues).
sub _isExternalMode {
    my ($mode, $status) = @_;

    return 0 unless defined $mode && $mode ne '';
    $mode =~ s/\D//g;
    # 0 / 10 = LMS / Wi-Fi squeezelite. Never treat as Connect from HTTP alone
    # (UPnP DIDL of the current LMS track was wiping the queue to 1 item).
    return 0 if $mode eq '' || $mode eq '10' || $mode eq '0';

    # Hardware inputs first — WiiM often still reports vendor=squeezelite while on BT/optical.
    return 1 if _isLiveInputMode($mode);

    # Spotify Connect / TIDAL / Qobuz / Roon mode numbers — even if vendor is still squeezelite.
    return 1 if $mode eq '31' || $mode eq '32' || $mode eq '36' || $mode eq '47';

    # Mode 1 (Network) and 34 (AirPlay / Spotify Connect on many firmwares):
    # vendor often stays "squeezelite" while a real Connect/AirPlay track plays.
    if ($mode eq '1' || $mode eq '34') {
        return _isProvenAppStream($status, $mode);
    }

    # LMS / squeezelite path — never external (leftover title would false-trigger),
    # unless UPnP already proved an app stream (Spotify Connect on Wi-Fi).
    if ($status && ($status->{vendor} || '') =~ /squeezelite/i) {
        return 0;
    }

    return 1 if $EXTERNAL_MODES{$mode};

    # Unknown mode numbers: only with a proven app vendor + metadata.
    # Leftover LMS titles alone used to inject a fake AirPlay track.
    return _isProvenAppStream($status, $mode);
}

# Client that owns the LMS playlist (sync master when grouped).
sub _playlistClient {
    my $client = shift || return;
    if (eval { $client->controller && $client->controller->can('master') }) {
        my $master = eval { $client->controller->master() };
        return $master if $master;
    }
    if (eval { $client->can('master') && $client->isSynced() }) {
        my $master = eval { $client->master() };
        return $master if $master;
    }
    return $client;
}

sub _inSyncGroup {
    my $client = shift || return 0;
    return 0 unless $client;
    return 1 if eval { $client->isSynced() };
    return 0;
}

# Drop LMS takeover locks (device left for a real external source).
sub _clearLmsTakeoverLocks {
    my ($client_or_id, $reason) = @_;
    my $id = ref $client_or_id ? ($client_or_id->id() || '') : ($client_or_id || '');
    return unless $id;
    my $had = $playerState{$id}{lms_playlist_control}
        || $playerState{$id}{lms_preset_pending}
        || $playerState{$id}{lms_transfer_pending}
        || $playerState{$id}{pending_lms_play}
        || $playerState{$id}{lms_commit_until};
    delete $playerState{$id}{lms_playlist_control};
    delete $playerState{$id}{lms_preset_pending};
    delete $playerState{$id}{lms_transfer_pending};
    delete $playerState{$id}{pending_lms_play};
    delete $playerState{$id}{play_from_start};
    delete $playerState{$id}{lms_commit_until};
    if ($had && $reason) {
        my $name = ref $client_or_id ? ($client_or_id->name() || $id) : $id;
        $log->info("Cleared LMS takeover on $name ($reason)");
    }
}

sub _lmsCommitHoldActive {
    my $id = shift // '';
    return 0 unless $id;
    my $until = $playerState{$id}{lms_commit_until} || 0;
    return $until && time() < $until ? 1 : 0;
}

# Mark a window where residual Bluetooth / Network-AirPlay must not steal the UI.
# Used for physical source-button BT→LMS, /control/source/wifi, and playlist takeover.
sub _markLmsCommit {
    my ($client, $reason) = @_;
    return unless $client;
    my $id = $client->id() || return;
    $playerState{$id}{lms_commit_until} = time() + $LMS_COMMIT_HOLD;
    $playerState{$id}{is_external} = 0;
    $playerState{$id}{external_hits} = 0;
    delete $playerState{$id}{remoteMeta};
    my $name = $client->name() || $id;
    $log->info("LMS commit hold ${LMS_COMMIT_HOLD}s on $name"
        . ($reason ? " ($reason)" : ''));
}

# True when WiiM getPlayerStatus is a real app stream (AirPlay/Spotify/…)
# rather than a Wi-Fi handoff blip or the HTTP-shortcut silence M3U.
sub _isProvenAppStream {
    my ($status, $mode) = @_;
    return 0 unless $status && ref $status eq 'HASH';
    my $st = lc($status->{status} // '');
    return 0 unless $st eq 'play' || $st eq 'pause' || $st eq 'paused';
    my $vendor = lc($status->{vendor} // '');
    # Do not reject vendor=squeezelite here. Spotify Connect / AirPlay on WiiM
    # often keep that vendor while mode is 31/34 and Title/Artist are real.
    $mode = '' unless defined $mode;
    $mode =~ s/\D//g;

    my $title  = _cleanMetaField(_decodeWiimField($status->{title}  // $status->{Title}  // ''));
    my $artist = _cleanMetaField(_decodeWiimField($status->{artist} // $status->{Artist} // ''));
    # HTTP shortcut / empty.mp3 titles are not a real stream.
    if ($title =~ /^(?:empty|silence|lms(?:\s+(?:control|preset).*?)?)$/i) {
        return 0;
    }
    my $has_meta = _hasRealTrackMeta($title, $artist);
    my $app_vendor = ($vendor =~ /airplay|spotify|tidal|qobuz|roon|dlna|cast|upnp/i) ? 1 : 0;

    # Mode 1 (Network): wifi coming up unless a real *app* track is present.
    # Do not treat LMS squeezelite titles on mode 1 as Connect.
    if ($mode eq '1') {
        return 1 if $app_vendor && $has_meta;
        return 1 if $vendor =~ /spotify|tidal|qobuz|roon|airplay/i;
        return 0;
    }
    # Mode 34 (AirPlay): idle receiver has vendor=Airplay and no track.
    if ($mode eq '34') {
        return 1 if $has_meta;
        return 0;
    }
    return 1 if $app_vendor && $has_meta;
    return 1 if $vendor =~ /spotify|tidal|qobuz|roon/i;
    return 0;
}

sub _normTitle {
    my $t = lc(_cleanMetaField(shift // ''));
    $t =~ s/^\s+|\s+$//g;
    $t =~ s/^the\s+//;
    $t =~ s/[^a-z0-9]+//g;
    return $t;
}

sub _lmsIsActivelyPlaying {
    my $client = shift || return 0;
    my $ok = 0;
    eval { $ok = 1 if $client->isPlaying && !$client->isPaused };
    return $ok;
}

# LMS squeezelite still owns the speaker vs Connect/AirPlay. Firmware often
# stays on mode 34 while Spotty plays; a 3–4s play glitch must not open inject.
sub _lmsHoldsRenderer {
    my $client = shift || return 0;
    my $id = eval { $client->id() } || '';
    if (_lmsIsActivelyPlaying($client)) {
        $playerState{$id}{lms_playing_at} = time() if $id;
        return 1;
    }
    return 0 unless $id;
    my $at = $playerState{$id}{lms_playing_at} || 0;
    return ($at && (time() - $at) < $LMS_RENDERER_HOLD) ? 1 : 0;
}

# Leftover LMS/silence titles on a Network-mode poll (false AirPlay).
sub _statusLooksLikeLmsLeftover {
    my ($client, $status) = @_;
    return 0 unless $status && ref $status eq 'HASH';
    my $title = _cleanMetaField(_decodeWiimField($status->{title} // $status->{Title} // ''));
    return 0 unless $title;
    return 1 if $title =~ /^(?:empty|silence|lms(?:\s+(?:control|preset).*?)?)$/i;
    return 0 unless $client;
    my $song = eval { $client->playingSong() || $client->streamingSong() };
    return 0 unless $song;
    my $lms_title = _cleanMetaField(eval { $song->title() } || '');
    return 0 unless $lms_title;
    my $a = _normTitle($title);
    my $b = _normTitle($lms_title);
    return 1 if $a && $b && ($a eq $b || index($a, $b) >= 0 || index($b, $a) >= 0);
    return 0;
}

# True when squeezelite is (or just was) playing the LMS queue. Title match is
# not required — firmware mode 31/34 plus the current LMS title is not Connect.
sub _lmsOwnsThisTrack {
    my ($client, $title) = @_;
    return 0 unless $client;
    return 1 if _lmsHoldsRenderer($client);
    return 0;
}

# UPnP of the current LMS squeezelite track is not Spotify Connect / AirPlay.
# Spotty DIDL often has source=spotify and mode=34 while LMS still owns playback.
sub _upnpIsLmsRendererMirror {
    my ($client, $title, $source) = @_;
    return 0 unless $client;
    my $mode = $playerState{$client->id() || ''}{mode} // '';
    $mode =~ s/\D//g;
    return 0 if _isLiveInputMode($mode);
    return 1 if _lmsHoldsRenderer($client);
    return 0;
}

# Whether LMS should block external status inject.
#
# User-initiated LMS content (add / play / load) sets lms_playlist_control.
# While that takeover is active, Bluetooth/optical/etc. must NOT re-inject or
# clear locks — otherwise BT "fights" the playlist the user just queued.
#
# Idle residual LMS queue alone does NOT block (would hide real AirPlay/BT).
sub _blocksExternalInject {
    my ($client, $mode) = @_;
    return 1 unless $client;

    my $id = $client->id() || return 0;
    my $st = $playerState{$id} || {};

    # Explicit LMS takeover / pending play always wins over live inputs.
    return 1 if $st->{lms_preset_pending} || $st->{lms_transfer_pending};
    return 1 if $st->{pending_lms_play};
    return 1 if _lmsCommitHoldActive($id);
    my $t = $st->{lms_playlist_control} || 0;
    # Grace after add/play: long enough for wifi switch + buffer; BT must not steal UI.
    return 1 if $t && (time() - $t) < 90;

    # LMS is actively playing a real library queue — keep inject off even if
    # WiiM briefly reports Bluetooth residual mode.
    if (_hasRealLmsPlaylist($client)) {
        my $playing = 0;
        eval {
            $playing = 1 if $client->isPlaying && !$client->isPaused;
        };
        return 1 if $playing;
        # Also block briefly after play if we still own control flag
        return 1 if $t && (time() - $t) < 180;
    }

    # Hardware inputs / app externals: allowed when LMS is not taking over.
    return 0 if _isLiveInputMode($mode);

    # Mode 31/34 is on the external whitelist, but firmware reports those
    # while squeezelite is still playing. Hold the LMS renderer instead.
    return 1 if _lmsHoldsRenderer($client);

    my $m = $mode // '';
    $m =~ s/\D//g if defined $m;
    return 0 if $m ne '' && $EXTERNAL_MODES{$m};

    if ($st->{is_external} || ($st->{play_state} || '') eq 'play') {
        my $meta = $st->{remoteMeta} || {};
        return 0 if _hasRealTrackMeta($meta->{title}, $meta->{artist});
    }

    return 0;
}

# Legacy name: used by transport forwarding / serverstatus guards.
# Live inputs with confirmed external state are NOT "owned" by LMS.
sub _lmsOwnsPlayback {
    my ($client, $mode) = @_;
    return 0 unless $client;
    $mode //= $playerState{$client->id() || ''}{mode};
    return _blocksExternalInject($client, $mode);
}

sub _metaSignature {
    my $meta = shift || {};
    # Cover CDN URLs grow a new token every notification. Comparing the full
    # URL made every event look like a new track and re-opened Now Playing.
    my $cover = $meta->{cover} // $meta->{arturl} // '';
    $cover =~ s/\?.*//;
    return join("\t",
        $meta->{title}  // '',
        $meta->{artist} // '',
        $meta->{album}  // '',
        $meta->{mode}   // '',
        $cover,
    );
}

sub _modeLabel {
    my $mode = shift;
    return 'External' unless defined $mode && $mode ne '';
    $mode =~ s/\D//g;
    return $EXTERNAL_MODES{$mode} || 'External';
}

# Prefer vendor when mode 1/unknown would otherwise show as Network/AirPlay.
sub _modeLabelFromStatus {
    my ($mode, $status) = @_;
    $mode = '' unless defined $mode;
    $mode =~ s/\D//g;
    return _modeLabel($mode) if _isLiveInputMode($mode);
    return 'Wi-Fi' if $mode eq '10' || $mode eq '0';
    my $vendor = lc(($status && ref $status eq 'HASH' ? $status->{vendor} : '') // '');
    return 'AirPlay'  if $vendor =~ /airplay/i;
    return 'Spotify'  if $vendor =~ /spotify/i;
    return 'TIDAL'    if $vendor =~ /tidal/i;
    return 'Qobuz'    if $vendor =~ /qobuz/i;
    return 'Roon'     if $vendor =~ /roon/i;
    return _modeLabel($mode);
}

# Display labels for hardware inputs (Bluetooth / Optical / RCA / …).
sub _liveInputLabel {
    my ($mode, $fallback) = @_;
    if (defined $mode && $mode ne '') {
        my $num = $mode;
        $num =~ s/\D//g;
        return $EXTERNAL_MODES{$num} if $num ne '' && $EXTERNAL_MODES{$num};
    }
    $fallback //= 'External';
    return 'Bluetooth Input' if $fallback =~ /Bluetooth/i;
    return 'Optical Input'   if $fallback =~ /Optical/i;
    return 'RCA Input'       if $fallback =~ /RCA/i;
    return 'HDMI Input'      if $fallback =~ /HDMI/i;
    return 'Line In'         if $fallback =~ /Line\s*In/i;
    return $fallback;
}

sub _liveInputMetadata {
    my ($client, $mode_name, $mode_num) = @_;
    my $label = _liveInputLabel($mode_num, $mode_name || 'External');
    return (
        title  => $label,
        artist => '',
        album  => '',
        mode   => $label,
        live_input => 1,
    );
}

# WiiM often reports status=stop on optical/line-in even while the input is live
# (no "track" in the Linkplay sense). Treat live hardware inputs as playing
# unless the device explicitly reports pause.
sub _normalizeLivePlayState {
    my ($mode, $status_str) = @_;
    return $status_str unless _isLiveInputMode($mode);
    my $s = lc($status_str // '');
    return 'pause' if $s eq 'pause' || $s eq 'paused';
    return 'play';
}

# True when title/artist look like real content (not empty / Unknown).
sub _hasRealTrackMeta {
    my ($title, $artist) = @_;
    $title  = _cleanMetaField($title  // '');
    $artist = _cleanMetaField($artist // '');
    return ($title || $artist) ? 1 : 0;
}

sub _materialSkinDir {
    for my $dir (Slim::Utils::PluginManager->dirsFor('plugins')) {
        my $path = File::Spec->catdir($dir, 'MaterialSkin');
        return $path if -d $path;
    }
    for my $path ('/usr/local/slimserver/Plugins/MaterialSkin') {
        return $path if -d $path;
    }
    return;
}

sub _readJsonFile {
    my $path = shift || return;
    return unless -r $path;
    my $raw = eval { read_file($path) };
    return unless defined $raw && $raw ne '';
    return eval { decode_json($raw) };
}

sub _writeJsonFile {
    my ($path, $data) = @_;
    return unless $path && $data && ref $data eq 'HASH';
    write_file($path, { binmode => ':utf8' }, encode_json($data));
}

sub _ensureMaterialSkinAssets {
    return if main::SCANNER;

    my $base = _materialSkinDir() || return;
    my $misc = File::Spec->catdir($base, 'HTML', 'material', 'html', 'misc');
    my $patched;

    my $emblems = _readJsonFile(File::Spec->catfile($misc, 'emblems.json'));
    if ($emblems && !$emblems->{wiim}) {
        $emblems->{wiim} = {
            name  => 'wiim',
            bgnd  => '#1a1a2e',
            color => '#ffffff',
        };
        eval { _writeJsonFile(File::Spec->catfile($misc, 'emblems.json'), $emblems); 1 } && do {
            $patched = 1;
            $log->info('Material Skin: registered wiim emblem');
        };
    }

    my $sources = _readJsonFile(File::Spec->catfile($misc, 'track-sources.json'));
    if ($sources && ref ($sources->{prefix} || {}) eq 'HASH') {
        my %wiim_sources = (
            'wiim://bluetooth' => { name => 'Bluetooth' },
            'wiim://linein'    => { name => 'Line In'   },
            'wiim://optical'   => { name => 'Optical'   },
            'wiim://rca'       => { name => 'RCA In'    },
            'wiim://hdmi'      => { name => 'HDMI'      },
            'wiim://tv'        => { name => 'TV'        },
            'wiim://wifi'      => { name => 'Wi-Fi'     },
            'wiim://airplay'   => { name => 'AirPlay'   },
            'wiim://spotify'   => { name => 'Spotify'   },
            'wiim://tidal'     => { name => 'TIDAL'     },
            'wiim://qobuz'     => { name => 'Qobuz'     },
            'wiim://roon'      => { name => 'Roon'      },
            'wiim://external'  => { name => 'WiiM'      },
            'wiim://live'      => { name => 'WiiM Live' },
        );
        my $added;
        for my $prefix (keys %wiim_sources) {
            next if $sources->{prefix}{$prefix};
            $sources->{prefix}{$prefix} = $wiim_sources{$prefix};
            $added = 1;
        }
        if ($added) {
            eval { _writeJsonFile(File::Spec->catfile($misc, 'track-sources.json'), $sources); 1 } && do {
                $patched = 1;
                $log->info('Material Skin: registered WiiM track source labels');
            };
        }
    }

    if ($patched || ($emblems && $emblems->{wiim}) || ($sources && $sources->{prefix}{'wiim://external'})) {
        $prefs->set('material_assets_patched', 1);
    }
    elsif ($sources && $sources->{prefix}{'wiim://rca'}) {
        $prefs->set('material_assets_patched', 1);
    }
}

sub _materialSourceUrl {
    my $mode = shift || 'External';
    # Never use spotify:// — Spotty's ProtocolHandler claims that scheme and
    # crashes (HASH-as-string) on the synthetic Connect URL, which then stops LMS.
    return 'wiim://spotify'          if $mode =~ /Spotify/i;
    return 'wiim://tidal'            if $mode =~ /TIDAL/i;
    return 'wiim://qobuz'            if $mode =~ /Qobuz/i;
    return 'wiim://airplay'          if $mode =~ /AirPlay/i;
    return 'wiim://bluetooth'        if $mode =~ /Bluetooth/i;
    return 'wiim://optical'          if $mode =~ /Optical/i;
    return 'wiim://rca'              if $mode =~ /RCA/i;
    return 'wiim://linein'           if $mode =~ /Line\s*In/i;
    return 'wiim://hdmi'             if $mode =~ /HDMI/i;
    return 'wiim://tv'               if $mode =~ /\bTV\b/i;
    return 'wiim://wifi'             if $mode =~ /Wi-?Fi/i;
    return 'wiim://roon'             if $mode =~ /Roon/i;
    return 'wiim://external';
}

sub _wiimStreamUrl {
    my ($client, $mode_name) = @_;
    return _materialSourceUrl($mode_name) unless $client;

    my $host = _wiimHost($client) || return _materialSourceUrl($mode_name);
    my $mac  = lc($client->id() || '');
    return "wiim://live/$host/$mac";
}

sub _registerWiimPlayer {
    my $client = shift || return;
    return unless isWiimPlayer($client);

    my $ip  = $client->ip();
    my $mac = lc($client->id() || '');
    $ipToMac{$ip} = $mac if $ip;
    if ($ip && $client->id()) {
        (my $host = $ip) =~ s/:\d+$//;
        $playerState{$client->id()}{host} = $host if $host ne '';
    }

    # Sync power-off intent with current LMS power on (re)connect.
    # Connected players that are off were either user-off or never powered on;
    # only treat as user_power_off when LMS reports power=0 *and* we already
    # tracked that flag (preserve across reconnect). Fresh connect with power=0
    # stays injectable so Spotify-while-squeezelite-off still works.
    if ($client->power) {
        _setUserPowerOff($client, 0);
    }

    Plugins::WiimIntegration::UPnPHelper::subscribe($client) if $prefs->get('enable_upnp');
    _refreshModel($client);
    _refreshLineoutMode($client);
    _ensureMonitor($client);
    # Read-only until a key is actually empty and the same-numbered Lyrion
    # slot has something to play. One pass per process, not the 60s poll.
    my $cid = $mac;
    apiCall($client, 'getPresetInfo', sub {
        my $data = shift || {};
        return unless $cid;
        $playerState{$cid}{presets} = $data->{preset_list} || [];
        $playerState{$cid}{preset_fetch_at} = time();
    });
    _ensurePresetKeys($client, 1);
    $log->info("Wiim player registered: " . $client->name() . " (" . ($ip || '?') . " -> $mac)");
}

# (Re)start the WiiM poll loop. Safe to call repeatedly (kills prior timer).
sub _ensureMonitor {
    my $client = shift || return;
    return unless isWiimPlayer($client);

    Slim::Utils::Timers::killTimers($client, \&monitorStatus);
    Slim::Utils::Timers::setTimer($client, time() + 0.2, \&monitorStatus, $client);
}

sub _findClientForWiimIp {
    my $remote_ip = shift || return;

    foreach my $client (Slim::Player::Client::clients()) {
        next unless isWiimPlayer($client);
        return $client if ($client->ip() || '') eq $remote_ip;
    }

    foreach my $dev (@{ $prefs->get('wiim_devices') || [] }) {
        my ($ip, $mac) = split(/:/, $dev, 3);
        next unless $ip && $mac && $remote_ip eq $ip;
        return Slim::Player::Client->getClient(lc($mac));
    }

    return;
}

sub initPlugin {
    my $class = shift;
    $class->SUPER::initPlugin(@_);

    # Settings must register even if the rest of the plugin is disabled —
    # otherwise optionsURL/setup links open a blank page (no page handler).
    if (main::WEBUI) {
        eval {
            Plugins::WiimIntegration::Settings->new;
            1;
        } or do {
            $log->error('WiimIntegration Settings failed to register: ' . ($@ || 'unknown error'));
        };
        _registerHttpEndpoints();
    }

    return unless $prefs->get('enabled');


    Slim::Control::Request::subscribe(\&clientEvent, [['client'], ['new', 'reconnect']]);
    Slim::Control::Request::subscribe(\&handlePlaylistEvent, [['playlist'], []]);
    Slim::Control::Request::subscribe(\&powerEvent, [['power']]);

    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'menu', '_index', '_quantity'], [1, 1, 1, \&menuQuery]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'sources', '_index', '_quantity'], [1, 1, 1, \&sourcesQuery]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'presets', '_index', '_quantity'], [1, 1, 1, \&presetsQuery]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'source', '_cmd', '_index', '_quantity'], [1, 1, 1, \&sourceCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'preset', '_num', '_index', '_quantity'], [1, 1, 1, \&presetCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'presetclaim', '_num', '_index', '_quantity'], [1, 1, 1, \&presetClaimCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'lineouts', '_index', '_quantity'], [1, 1, 1, \&lineoutsQuery]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'lineout', '_mode', '_index', '_quantity'], [1, 1, 1, \&lineoutCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'listen', '_wiimid'], [1, 0, 1, \&listenCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'diffuse', '_dest'], [1, 0, 1, \&diffuseCommand]
    );
    Slim::Control::Request::addDispatch(
        ['wiimintegration', 'diffusereset'], [1, 0, 0, \&diffuseResetCommand]
    );
    $originalMixerVolume = Slim::Control::Request::addDispatch(
        ['mixer', 'volume', '_newvalue'], [1, 0, 1, \&wiimMixerVolume]
    );
    $originalMixerMuting = Slim::Control::Request::addDispatch(
        ['mixer', 'muting', '_newvalue'], [1, 0, 1, \&wiimMixerMuting]
    );
    $originalPlaylistJump = Slim::Control::Request::addDispatch(
        ['playlist', 'index', '_index', '_fadein', '_noplay', '_seekdata'], [1, 0, 0, \&wiimPlaylistJump]
    );
    Slim::Control::Request::addDispatch(
        ['playlist', 'jump', '_index', '_fadein', '_noplay', '_seekdata'], [1, 0, 0, \&wiimPlaylistJump]
    );
    $originalButton = Slim::Control::Request::addDispatch(
        ['button', '_buttoncode', '_time', '_orFunction'], [1, 0, 0, \&wiimButton]
    );
    $originalPlay = Slim::Control::Request::addDispatch(
        ['play', '_fadein'], [1, 0, 0, \&wiimPlay]
    );
    $originalPause = Slim::Control::Request::addDispatch(
        ['pause', '_newvalue', '_fadein', '_suppressShowBriefly'], [1, 0, 0, \&wiimPause]
    );
    $originalPower = Slim::Control::Request::addDispatch(
        ['power', '_newvalue', '_noplay'], [1, 0, 1, \&wiimPower]
    );
    _registerMaterialMenu();
    _ensureMaterialSkinAssets();

    Plugins::WiimIntegration::UPnPHelper::setHandler(\&_onUPnPEvent);
    # wiim:// is already the synthetic source URL (wiim://spotify, wiim://live/…).
    # A separate scheme keeps that overlay from being opened as audio.
    Slim::Player::ProtocolHandlers->registerHandler(
        'wiimrelay' => 'Plugins::WiimIntegration::RelayProto',
    );
    Slim::Player::ProtocolHandlers->registerURLHandler(
        '/plugins/WiimIntegration/relay\.mp3(?:\?|$)' => 'Plugins::WiimIntegration::RelayProto',
    );
    Slim::Player::ProtocolHandlers->registerURLHandler(
        'https?://[^/]+:8086/stream\.(?:mp3|flac)(?:\?|$)' => 'Plugins::WiimIntegration::RelayProto',
    );

    Plugins::WiimIntegration::DlnaRenderer::start({
        source_for_ip     => \&_dlnaSourceForIp,
        source_for_client => \&_dlnaSourceForClient,
        targets           => \&_dlnaTargets,
        play_on           => \&_dlnaPlayOn,
        transport_on      => \&_dlnaTransportOn,
        refresh_on        => \&_dlnaRefreshOn,
        base_url          => \&_lmsListenBaseUrl,
    });
    $log->warn("Wiim Integration v1.0.49 loaded");

    foreach my $client (Slim::Player::Client::clients()) {
        _registerWiimPlayer($client);
    }
}

sub postinitPlugin {
    my $class = shift;
    _wrapStatusAfterPlugins();
    _wrapMaterialSkinAfterPlugins();
    _wrapPlaylistMutatorsAfterPlugins();
    # Discovery::init has run. Registering earlier would advertise into empty sockets.
    Plugins::WiimIntegration::DlnaRenderer::register_discovery();
    my $relay_probe = _lmsListenBaseUrl() . '/plugins/WiimIntegration/relay.mp3?wiim=x';
    my $relay_handler = eval { Slim::Player::ProtocolHandlers->handlerForURL($relay_probe) } || '';
    my $wiim_handler = eval { Slim::Player::ProtocolHandlers->handlerForURL('wiimrelay://00:11:22:33:44:55') } || '';
    $log->warn("DLNA handlers relay=$relay_handler wiim=$wiim_handler");
}

sub shutdownPlugin {
    Plugins::WiimIntegration::DlnaRenderer::stop();
}

# Intercept play/add/load so residual LMS queue tracks cannot block newly chosen material
# while WiiM was on radio / Bluetooth / external (clear → add → play from start).
sub _wrapPlaylistMutatorsAfterPlugins {
    return if $playlistMutatorWrapperInstalled;

    # Must keep the same positional params as core LMS (Request.pm). Wrapping with
    # only ['playlist','loadtracks'] drops _what/_listref and makes every
    # playlistcontrol cmd:load/add fail with "Bad params" after clearing the queue.
    $originalPlaylistControl = Slim::Control::Request::addDispatch(
        ['playlistcontrol'], [1, 0, 1, \&wiimPlaylistControl]
    );
    $originalPlaylistLoadTracks = Slim::Control::Request::addDispatch(
        ['playlist', 'loadtracks', '_what', '_listref', '_fadein', '_index'],
        [1, 0, 0, \&wiimPlaylistLoadTracks]
    );
    $originalPlaylistAddTracks = Slim::Control::Request::addDispatch(
        ['playlist', 'addtracks', '_what', '_listref'],
        [1, 0, 0, \&wiimPlaylistAddTracks]
    );
    $originalPlaylistPlayTracks = Slim::Control::Request::addDispatch(
        ['playlist', 'playtracks', '_what', '_listref', '_fadein', '_index'],
        [1, 0, 0, \&wiimPlaylistPlayTracks]
    );
    $playlistMutatorWrapperInstalled = 1;
    $log->info("Wiim playlist mutator wrappers installed");
}

sub _wrapStatusAfterPlugins {
    return if $statusWrapperInstalled;

    $statusHandler = Slim::Control::Request::addDispatch(
        ['status', '_index', '_quantity'], [1, 1, 1, \&wiimStatusQuery]
    );
    # Must keep the same param names as core LMS (_index/_quantity) or
    # serverstatusQuery never builds players_loop.
    $originalServerStatus = Slim::Control::Request::addDispatch(
        ['serverstatus', '_index', '_quantity'], [0, 1, 1, \&wiimServerStatus]
    );
    $statusWrapperInstalled = 1;
    $log->info("Wiim status/serverstatus query wrappers installed");
}

# Patch player list power/isplaying so external WiiM streams (Spotify, BT, …)
# show as On/playing in Material Skin and other UIs — LMS squeezelite state is often off.
# Never override when the user deliberately powered the player off in Lyrion.
sub wiimServerStatus {
    my ($request) = @_;
    $originalServerStatus->($request) if $originalServerStatus;

    my $i = 0;
    while (1) {
        my $id = $request->getResultLoop('players_loop', $i, 'playerid');
        last unless defined $id && $id ne '';

        my $state = $playerState{$id} || $playerState{lc($id)} || {};
        # Power off in Lyrion must win over a previous external On/playing override.
        if ($state->{user_power_off}) {
            $request->addResultLoop('players_loop', $i, 'power', 0);
            $request->addResultLoop('players_loop', $i, 'isplaying', 0);
            $i++;
            next;
        }
        if ($state->{is_external}) {
            my $client = Slim::Player::Client->getClient($id);
            my $mode   = $state->{mode};
            if (!($client && _blocksExternalInject($client, $mode))) {
                if (!$client || _canPresentExternal($client, $state)) {
                    $request->addResultLoop('players_loop', $i, 'power', 1);
                    my $ps = _normalizeLivePlayState($mode, $state->{play_state});
                    $request->addResultLoop('players_loop', $i, 'isplaying', 1)
                        if $ps eq 'play' || (_isLiveInputMode($mode) && $ps ne 'pause');
                }
            }
        }
        $i++;
    }
}

# Honour explicit Lyrion power off/on. Power-off stops the WiiM and keeps the
# UI Off while it is idle. Polling continues, and a later WiiM play is followed
# without powering the Lyrion player back on.
sub wiimPower {
    my ($request) = @_;
    my $client = $request->client();

    if ($client && isWiimPlayer($client)) {
        my $new = $request->getParam('_newvalue');
        if (defined $new && $new ne '?' && $new ne '') {
            my $on = ($new eq '1' || $new == 1) ? 1 : 0;
            if ($on) {
                _setUserPowerOff($client, 0);
                $log->info('WiiM power ON (resume status): ' . $client->name());
            }
            else {
                _setUserPowerOff($client, 1);
                $log->info('WiiM power OFF (pause external UI): ' . $client->name());
            }
        }
    }

    $originalPower->($request) if $originalPower;

    # After power settles, restart monitoring and push a fresh status.
    if ($client && isWiimPlayer($client)) {
        my $new = $request->getParam('_newvalue');
        if (defined $new && $new ne '?' && $new ne '') {
            my $on = ($new eq '1' || $new == 1) ? 1 : 0;
            _ensureMonitor($client);
            if ($on) {
                # Immediate poll so external metadata reappears without waiting.
                Slim::Utils::Timers::setTimer($client, time() + 0.25, sub {
                    my $c = shift || return;
                    apiCall($c, 'getPlayerStatus', sub {
                        _applyPlayerStatus($c, shift);
                        _scheduleStatusRefresh($c, 0.1);
                    });
                }, $client);
            }
            else {
                # Drop the external Now Playing overlay so the next status
                # query is the real Lyrion off state, then push that query.
                $playerState{$client->id()}{is_external} = 0;
                $playerState{$client->id()}{external_hits} = 0;
                delete $playerState{$client->id()}{remoteMeta};
                _stopWiimForPowerOff($client);
                _scheduleStatusRefresh($client, 0.05);
            }
        }
    }
}

sub powerEvent {
    my $request = shift || return;
    my $client  = $request->client() || return;
    return unless isWiimPlayer($client);

    # Notifications from powerCommand (including other UIs / CLI).
    # wiimPower already handles the dispatch path; this catches any other
    # path that still emits a power notification.
    my $new = $request->getParam('_newvalue');
    if (!defined $new || $new eq '' || $new eq '?') {
        return;
    }

    my $on = ($new eq '1' || $new == 1) ? 1 : 0;
    my $was_off = _userPowerOff($client) ? 1 : 0;
    _setUserPowerOff($client, $on ? 0 : 1);

    # Only act on transitions we did not already handle in wiimPower
    # (idempotent: ensure monitor is alive either way).
    _ensureMonitor($client);
    if ($on && $was_off) {
        Slim::Utils::Timers::setTimer($client, time() + 0.3, sub {
            my $c = shift || return;
            apiCall($c, 'getPlayerStatus', sub {
                _applyPlayerStatus($c, shift);
                _scheduleStatusRefresh($c, 0.1);
            });
        }, $client);
    }
    elsif (!$on && !$was_off) {
        my $id = $client->id();
        $playerState{$id}{is_external} = 0;
        $playerState{$id}{external_hits} = 0;
        delete $playerState{$id}{remoteMeta};
        _stopWiimForPowerOff($client);
        _scheduleStatusRefresh($client, 0.05);
    }
}

sub _wrapMaterialSkinAfterPlugins {
    return if $materialSkinWrapperInstalled;

    $originalMaterialSkin = Slim::Control::Request::addDispatch(
        ['material-skin', '_cmd'], [0, 0, 1, \&wiimMaterialSkinCommand]
    );
    $materialSkinWrapperInstalled = 1;
    $log->info("Wiim Material transferqueue wrapper installed") if $originalMaterialSkin;
}

sub wiimMaterialSkinCommand {
    my ($request) = @_;
    my $cmd = $request->getParam('_cmd') // '';

    if ($cmd eq 'transferqueue' && _handleWiimTransferQueue($request)) {
        return;
    }

    $originalMaterialSkin->($request) if $originalMaterialSkin;
}

sub _lmsTakeoverPending {
    my $id = shift // '';
    return 0 unless $id;
    return 1 if $playerState{$id}{lms_preset_pending} || $playerState{$id}{lms_transfer_pending};
    return 1 if _lmsCommitHoldActive($id);
    return 1 if _lmsPlaylistControlActive($id);
    return 0;
}

sub _lmsPlaylistControlActive {
    my $id = shift // '';
    return 0 unless $id;
    my $t = $playerState{$id}{lms_playlist_control} || 0;
    return $t && (time() - $t) < 120 ? 1 : 0;
}

sub _hasRealLmsPlaylist {
    my $client = shift || return 0;

    # Prefer sync master — slaves often have an empty local playList().
    for my $c ($client, _playlistClient($client)) {
        next unless $c;
        my $playlist = Slim::Player::Playlist::playList($c) || [];
        next unless @$playlist;

        for my $song (@$playlist) {
            my $track = eval { $song->currentTrack } || next;
            my $url = $track->url || '';
            next unless $url;
            next if $url =~ m{^wiim://}i;
            next if $url =~ m{://wiim/}i;
            return 1;
        }
    }
    return 0;
}

# Request LMS/squeezelite control. Optional $force: user loaded LMS content.
# Without $force, never interrupt a confirmed external stream (AirPlay/BT/…).
sub _takeLmsPlaylistControl {
    my ($client, $force) = @_;
    $client || return;
    my $id = $client->id() || return;

    my $mode = $playerState{$id}{mode};
    my $have_mode = defined $mode && $mode ne '';
    $mode =~ s/\D//g if $have_mode;
    $mode = '' unless $have_mode;

    my $on_external = $playerState{$id}{is_external}
        || _isLiveInputMode($mode)
        || ($mode ne '' && $EXTERNAL_MODES{$mode});

    # Soft path: playlist bookkeeping while on AirPlay/BT — do not kill stream.
    if ($on_external && !$force) {
        $log->info('Skip LMS wifi takeover on ' . ($client->name() || $id)
            . " (external mode=$mode)");
        return;
    }

    # Before first getPlayerStatus we do not know mode — defer (avoids startup
    # thrash that was wiping AirPlay with switchmode:wifi every restart).
    if (!$have_mode || !($playerState{$id}{poll_count} || 0)) {
        $playerState{$id}{want_lms_control} = $force ? 1 : 0;
        $log->info('Defer LMS takeover on ' . ($client->name() || $id)
            . ' (waiting for first WiiM status)');
        return;
    }

    # Forced content load while external: user chose LMS — proceed.
    # Forced while already wifi: proceed.

    $playerState{$id}{lms_playlist_control} = time();
    $playerState{$id}{is_external} = 0;
    $playerState{$id}{pending_lms_play} = 1;
    $playerState{$id}{external_hits} = 0;
    $playerState{$id}{lms_commit_until} = time() + $LMS_COMMIT_HOLD;
    delete $playerState{$id}{want_lms_control};
    delete $playerState{$id}{remoteMeta};
    delete $playerState{$id}{user_power_off};

    apiCall($client, 'setPlayerCmd:pause');
    apiCall($client, 'setPlayerCmd:audiocast:0') if $playerState{$id}{audiocast};

    my $mode_name = $playerState{$id}{mode_name} // '';
    my $need_wifi = !($mode eq '10' || $mode eq '0' || ($mode_name || '') =~ /Wi-?Fi/i);

    my $after = sub {
        my $c = shift || return;
        if ($c->can('power') && !$c->power) {
            eval { Slim::Control::Request::executeRequest($c, ['power', '1', '1']) };
        }
        Slim::Utils::Timers::setTimer($c, time() + 0.6, \&_maybeStartLmsPlayback, $c);
        Slim::Utils::Timers::setTimer($c, time() + 2.0, \&_maybeStartLmsPlayback, $c);
        _scheduleStatusRefresh($c, 0.3);
    };

    if ($need_wifi) {
        $log->info('LMS playlist control takeover on ' . $client->name() . ' (switch → wifi)');
        apiCall($client, 'setPlayerCmd:switchmode:wifi', sub {
            $after->($client);
        });
    }
    else {
        $log->info('LMS playlist control takeover on ' . $client->name() . ' (already wifi)');
        $after->($client);
    }
}

# True when leftover LMS queue / external radio would block newly chosen material.
sub _residualQueueBlocksNewContent {
    my $client = shift || return 0;
    my $id = $client->id() || return 0;
    return 1 if $playerState{$id}{is_external};
    my $mode = $playerState{$id}{mode} // '';
    return 1 if _isLiveInputMode($mode);
    return 1 if _isExternalMode($mode, {});
    return 0;
}

sub _clearLmsQueueQuietly {
    my $client = shift || return;
    my $id = $client->id() || return;
    my $playlist = Slim::Player::Playlist::playList($client) || [];
    return unless @$playlist;

    $log->info('Clearing residual LMS queue on ' . ($client->name() || $id)
        . ' (' . scalar(@$playlist) . ' item(s)) before new content');
    $playerState{$id}{suppress_playlist_hook} = 1;
    eval { Slim::Control::Request::executeRequest($client, ['playlist', 'clear']); };
    delete $playerState{$id}{suppress_playlist_hook};
}

sub _schedulePlayLmsQueueFromStart {
    my ($client, $reason) = @_;
    return unless $client;
    my $id = $client->id() || return;
    $playerState{$id}{pending_lms_play} = 1;
    $playerState{$id}{play_from_start} = 1;
    $log->info('Will play LMS queue from start on ' . ($client->name() || $id)
        . ($reason ? " ($reason)" : ''));
    Slim::Utils::Timers::killTimers($client, \&_playLmsQueueFromStart);
    Slim::Utils::Timers::setTimer($client, time() + 0.5, \&_playLmsQueueFromStart, $client);
    Slim::Utils::Timers::setTimer($client, time() + 1.5, \&_playLmsQueueFromStart, $client);
    Slim::Utils::Timers::setTimer($client, time() + 3.0, \&_playLmsQueueFromStart, $client);
}

# After leaving Bluetooth/Optical/etc., kick LMS play if the queue has real tracks
# but nothing is playing (common after "Play now" while an external source was active).
sub _maybeStartLmsPlayback {
    my $client = shift || return;
    return unless isWiimPlayer($client);
    return if $client->disconnected;
    my $id = $client->id() || return;
    return if $playerState{$id}{user_http_paused};
    return unless $playerState{$id}{pending_lms_play} || _lmsTakeoverPending($id);
    return unless _hasRealLmsPlaylist($client);

    if ($playerState{$id}{play_from_start}) {
        _playLmsQueueFromStart($client);
        return;
    }

    if ($client->isPlaying && !$client->isPaused) {
        delete $playerState{$id}{pending_lms_play};
        return;
    }

    $log->info('Starting LMS playback after external→wifi on ' . $client->name());
    eval { Slim::Control::Request::executeRequest($client, ['play']) };
    # Keep trying briefly; clear flag after a short window.
    my $t = $playerState{$id}{lms_playlist_control} || 0;
    delete $playerState{$id}{pending_lms_play} if $t && (time() - $t) > 8;
}

# Always start at index 0 so old residual tracks cannot keep "play" stuck on pause.
sub _playLmsQueueFromStart {
    my $client = shift || return;
    return unless isWiimPlayer($client);
    return if $client->disconnected;
    my $id = $client->id() || return;
    return if $playerState{$id}{user_http_paused};
    return unless _hasRealLmsPlaylist($client);

    if ($client->isPlaying && !$client->isPaused && !$playerState{$id}{play_from_start}) {
        delete $playerState{$id}{pending_lms_play};
        return;
    }

    $log->info('Playing LMS queue from start on ' . ($client->name() || $id));
    $playerState{$id}{suppress_playlist_hook} = 1;
    eval {
        # playlist index 0 starts that track (does not merely resume a stale pause).
        Slim::Control::Request::executeRequest($client, ['playlist', 'index', 0]);
    };
    delete $playerState{$id}{suppress_playlist_hook};

    if ($client->isPlaying && !$client->isPaused) {
        delete $playerState{$id}{pending_lms_play};
        delete $playerState{$id}{play_from_start};
    }
    else {
        # Fallback if index alone did not unstick the controller.
        eval { Slim::Control::Request::executeRequest($client, ['play']) };
        my $t = $playerState{$id}{lms_playlist_control} || 0;
        if ($t && (time() - $t) > 8) {
            delete $playerState{$id}{pending_lms_play};
            delete $playerState{$id}{play_from_start};
        }
    }
}

# playlistcontrol is what Material / browse use for Play / Add playlist / album.
sub wiimPlaylistControl {
    my ($request) = @_;
    my $client = $request->client();

    unless ($client && isWiimPlayer($client)) {
        $originalPlaylistControl->($request) if $originalPlaylistControl;
        return;
    }

    my $cmd = lc($request->getParam('cmd') // '');
    my $blocks = _residualQueueBlocksNewContent($client);
    my $clear_first = 0;
    my $force_play  = 0;

    # load already replaces the queue; add/play/insert leave residual tracks that
    # keep the player on the old (paused) item — clear first when leaving external.
    if ($blocks && $cmd =~ /^(?:add|play|insert)$/) {
        $clear_first = 1;
        $force_play  = 1;
    }
    elsif ($blocks && $cmd eq 'load') {
        $force_play = 1;
    }
    elsif ($cmd =~ /^(?:load|play)$/) {
        $force_play = 1;
    }

    if ($clear_first) {
        _clearLmsQueueQuietly($client);
    }

    if ($cmd =~ /^(?:load|play|add|insert)$/) {
        _takeLmsPlaylistControl($client, 1);
    }

    $originalPlaylistControl->($request) if $originalPlaylistControl;

    if ($force_play || $clear_first) {
        _schedulePlayLmsQueueFromStart($client, "playlistcontrol cmd:$cmd");
    }
}

sub wiimPlaylistLoadTracks {
    my ($request) = @_;
    my $client = $request->client();

    unless ($client && isWiimPlayer($client)) {
        $originalPlaylistLoadTracks->($request) if $originalPlaylistLoadTracks;
        return;
    }

    _takeLmsPlaylistControl($client, 1);
    $originalPlaylistLoadTracks->($request) if $originalPlaylistLoadTracks;
    _schedulePlayLmsQueueFromStart($client, 'loadtracks');
}

sub wiimPlaylistAddTracks {
    my ($request) = @_;
    my $client = $request->client();

    unless ($client && isWiimPlayer($client)) {
        $originalPlaylistAddTracks->($request) if $originalPlaylistAddTracks;
        return;
    }

    # Adding while on Bluetooth / external: take wifi + start LMS so the new
    # tracks are not stuck behind a live input that keeps re-injecting status.
    my $on_external = _residualQueueBlocksNewContent($client);
    my $clear_first = $on_external;
    _clearLmsQueueQuietly($client) if $clear_first;
    _takeLmsPlaylistControl($client, 1);
    $originalPlaylistAddTracks->($request) if $originalPlaylistAddTracks;
    if ($clear_first || $on_external) {
        _schedulePlayLmsQueueFromStart($client,
            $clear_first ? 'addtracks (cleared residual / left external)' : 'addtracks (left external)');
    }
}

sub wiimPlaylistPlayTracks {
    my ($request) = @_;
    my $client = $request->client();

    unless ($client && isWiimPlayer($client)) {
        $originalPlaylistPlayTracks->($request) if $originalPlaylistPlayTracks;
        return;
    }

    # playtracks should replace and play; residual queue still confuses some paths.
    if (_residualQueueBlocksNewContent($client) || _hasRealLmsPlaylist($client)) {
        _clearLmsQueueQuietly($client) if _residualQueueBlocksNewContent($client);
    }
    _takeLmsPlaylistControl($client, 1);
    $originalPlaylistPlayTracks->($request) if $originalPlaylistPlayTracks;
    _schedulePlayLmsQueueFromStart($client, 'playtracks');
}

sub _isStreamMonitorOfWiim {
    my ($client, $wiim) = @_;
    return 0 unless $client && $wiim;

    my $song = $client->playingSong() || $client->streamingSong() || return 0;
    my $url = lc($song->url() || '');
    return 0 unless $url =~ /stream\.mp3/;

    my $wiim_id = lc($wiim->id() || '');
    return 1 if $wiim_id && $url =~ /\Q$wiim_id\E/;
    return 0;
}

sub _resolveTransferRedirect {
    my $to = shift || return;
    my $to_id = lc($to->id() || '');

    if (isWiimPlayer($to) && $playerState{$to_id}{is_external}) {
        return { wiim => $to, receiver => undef };
    }

    foreach my $wiim (_allWiimClients()) {
        if (_isStreamMonitorOfWiim($to, $wiim)) {
            return { wiim => $wiim, receiver => $to };
        }
    }

    return;
}

sub _clearLmsTransferPending {
    my $client = shift || return;
    delete $playerState{$client->id()}{lms_transfer_pending};
}

sub _prepareWiimForLms {
    my ($wiim, $callback) = @_;
    return unless $wiim && $callback;

    my $id = $wiim->id();
    Slim::Utils::Timers::killTimers($wiim, $callback);
    Slim::Utils::Timers::killTimers($wiim, \&_clearLmsTransferPending);

    $playerState{$id}{lms_transfer_pending} = 1;
    $playerState{$id}{is_external} = 0;
    delete $playerState{$id}{remoteMeta};

    apiCall($wiim, 'setPlayerCmd:pause');
    apiCall($wiim, 'setPlayerCmd:audiocast:0') if $playerState{$id}{audiocast};

    my $mode = $playerState{$id}{mode} // '';
    my $mode_name = $playerState{$id}{mode_name} // '';
    if ($mode eq '10' || $mode eq '0' || $mode_name eq 'Wi-Fi') {
        Slim::Utils::Timers::setTimer($wiim, time() + 0.5, $callback, $wiim);
    }
    else {
        apiCall($wiim, 'setPlayerCmd:switchmode:wifi', sub {
            Slim::Utils::Timers::setTimer($wiim, time() + 2, $callback, $wiim);
        });
    }

    Slim::Utils::Timers::setTimer($wiim, time() + 20, \&_clearLmsTransferPending, $wiim);
}

sub _executeWiimQueueTransfer {
    my ($from, $wiim, $receiver, $mode, $fromWasPlaying, $fromIndex, $toWasPlaying, $toIndex) = @_;
    return unless $from && $wiim;

    my $wiim_id = $wiim->id();
    my @sourceBuddies = $from->isSynced() ? $from->syncedWith() : ();

    $wiim->execute(['power', 1]) unless $wiim->power;

    if ($mode eq 'swap') {
        my $fromPl = 'wiimintegration-swap-' . $from->id();
        my $toPl   = 'wiimintegration-swap-' . $wiim_id;
        (my $fromSafe = $fromPl) =~ s/:/_/g;
        (my $toSafe   = $toPl)   =~ s/:/_/g;

        $from->execute(['playlist', 'save', $fromSafe]);
        my $fromPlObj = Slim::Schema->single('Playlist', { title => $fromSafe });
        $wiim->execute(['playlist', 'save', $toSafe]);
        my $toPlObj = Slim::Schema->single('Playlist', { title => $toSafe });

        if ($fromPlObj && $toPlObj) {
            $from->execute(['playlist', 'clear']);
            $from->execute(['playlistcontrol', 'cmd:add', 'playlist_id:' . $toPlObj->id]);
            $wiim->execute(['playlist', 'clear']);
            $wiim->execute(['playlistcontrol', 'cmd:add', 'playlist_id:' . $fromPlObj->id]);
            Slim::Control::Request::executeRequest(undef, ['playlists', 'delete', 'playlist_id:' . $fromPlObj->id]);
            Slim::Control::Request::executeRequest(undef, ['playlists', 'delete', 'playlist_id:' . $toPlObj->id]);

            if ($fromWasPlaying) {
                $wiim->execute(['playlist', 'index', $fromIndex]) if defined $fromIndex;
                $wiim->execute(['play']);
            }
            if ($toWasPlaying) {
                $from->execute(['playlist', 'index', $toIndex]) if defined $toIndex;
                $from->execute(['play']);
            }
        }
    }
    else {
        $from->execute(['sync', $wiim_id]);
        $from->execute(['sync', '-']);

        for my $buddy (@sourceBuddies) {
            $from->execute(['sync', $buddy->id()]);
        }

        if ($mode eq 'move') {
            $from->execute(['playlist', 'clear']);
            $from->execute(['power', 0]);
        }

        if ($fromWasPlaying) {
            $wiim->execute(['playlist', 'index', $fromIndex]) if defined $fromIndex && $fromIndex ne '';
            $wiim->execute(['play']);
        }
    }

    if ($receiver && lc($receiver->id()) ne lc($wiim_id)) {
        $receiver->execute(['playlist', 'clear']);
        $receiver->execute(['power', 0]) if $mode eq 'move' || $mode eq 'swap';
    }

    $playerState{$wiim_id}{lms_playlist_control} = time();
    _clearLmsTransferPending($wiim);
    $log->info(sprintf(
        'Transferred queue from %s to WiiM %s (mode=%s, index=%s)',
        $from->name(), $wiim->name(), $mode, $fromIndex // 0
    ));
}

sub _handleWiimTransferQueue {
    my ($request) = @_;

    my $fromId = $request->getParam('from');
    my $toId   = $request->getParam('to');
    my $mode   = $request->getParam('mode');
    return 0 unless $fromId && $toId && $mode;

    my $from = Slim::Player::Client->getClient($fromId);
    my $to   = Slim::Player::Client->getClient($toId);
    return 0 unless $from && $to;

    my $redirect = _resolveTransferRedirect($to) || return 0;
    my $wiim     = $redirect->{wiim};
    my $receiver = $redirect->{receiver};
    return 0 unless $wiim;

    if ($from->id() eq $wiim->id()) {
        $request->setStatusDone();
        $request->addResult('error', 'Queue is already on this WiiM player');
        return 1;
    }

    my $fromWasPlaying   = $from->isPlaying();
    my $toWasPlaying     = $to->isPlaying();
    my $fromCurrentIndex = Slim::Player::Source::playingSongIndex($from);
    my $toCurrentIndex   = Slim::Player::Source::playingSongIndex($to);

    _prepareWiimForLms($wiim, sub {
        _executeWiimQueueTransfer(
            $from, $wiim, $receiver, $mode,
            $fromWasPlaying, $fromCurrentIndex,
            $toWasPlaying, $toCurrentIndex
        );
    });

    $request->setStatusDone();
    return 1;
}

sub clientEvent {
    my $request = shift;
    _registerWiimPlayer($request->client());
}

sub _registerMaterialMenu {
    return if main::SCANNER;

    Slim::Control::Jive::registerPluginMenu([{
        stringToken => 'WIIM_EXTRAS',
        id          => 'wiimIntegrationExtras',
        weight      => 55,
        actions     => {
            go => {
                cmd    => ['wiimintegration', 'menu'],
                player => 0,
            },
        },
    }], 'extras');
}

sub webPages {
    my $class = shift;
    return unless main::WEBUI;

    # Re-register settings here too (SUPER::initPlugin calls webPages before
    # our Settings->new in some load orders).
    eval { Plugins::WiimIntegration::Settings->new; 1; };

    my $prefix = 'plugins/WiimIntegration/';
    Slim::Web::Pages->addPageLinks('plugins', { WIIM_EXTRAS => $prefix . 'extras.html' });
    Slim::Web::Pages->addPageLinks('icons',   { WIIM_EXTRAS => 'MTL_svg_wiim' });

    Slim::Web::Pages->addPageFunction($prefix . 'extras.html',  \&_webExtrasPage);
    Slim::Web::Pages->addPageFunction($prefix . 'sources.html', \&_webSourcesPage);
    Slim::Web::Pages->addPageFunction($prefix . 'presets.html',  \&_webPresetsPage);
    Slim::Web::Pages->addPageFunction($prefix . 'lineout.html', \&_webLineoutPage);
    Slim::Web::Pages->addPageFunction($prefix . 'action.html',  \&_webActionPage);
    Slim::Web::Pages->addPageFunction($prefix . 'dlna.html',    \&_webDlnaPage);
}

sub _webPlayerId {
    my ($client, $params) = @_;
    return $params->{player} if $params && $params->{player};
    return $client->id()     if $client && $client->id();

    my $query = $params->{url_query} // '';
    if ($query =~ /(?:^|&)player=([^&]+)/) {
        return Slim::Utils::Misc::unescape($1, 1);
    }
    return '';
}

sub _webParam {
    my ($params, $name) = @_;
    return '' unless $params && $name;

    my $value = $params->{$name};
    if (defined $value && $value ne '') {
        return $value;
    }

    my $query = $params->{url_query} // '';
    if ($query =~ /(?:^|&)\Q$name\E=([^&]+)/) {
        return Slim::Utils::Misc::unescape($1, 1);
    }
    return '';
}

sub _webContextClient {
    my ($client, $params) = @_;
    my $player_id = lc(_webPlayerId($client, $params) || '');

    if ($player_id) {
        return Slim::Player::Client->getClient($player_id) || $client;
    }

    return $client;
}

sub _webClient {
    my ($client, $params) = @_;
    $client = _webContextClient($client, $params);

    return $client if $client && isWiimPlayer($client);
    return $client if $client && $client->id() && exists $playerState{ lc $client->id() };
    return;
}

sub _allWiimClients {
    my @clients;
    foreach my $client (Slim::Player::Client::clients()) {
        push @clients, $client if isWiimPlayer($client);
    }
    return sort { lc($a->name() || '') cmp lc($b->name() || '') } @clients;
}

sub _wiimClientById {
    my $id = lc(shift // '');
    $id =~ s/^\s+|\s+$//g;
    return unless $id;

    foreach my $client (_allWiimClients()) {
        return $client if lc($client->id() || '') eq $id;
    }

    my $client = Slim::Player::Client->getClient($id);
    return $client if $client && isWiimPlayer($client);
    return;
}

sub _streamUrl {
    my $client = shift || return '';
    my $mac = lc($client->id() || '');
    return '' unless $mac;
    return Slim::Utils::Network::serverURL() . '/stream.mp3?player=' . uri_escape_utf8($mac);
}

# The LMS /stream.mp3 proxy closes without a body. The address VLC can play
# is the HTTP stream the WiiM already handed to the renderer.
sub _directStreamUrl {
    my $wiim = shift || return '';
    return '' unless isWiimPlayer($wiim);
    my $id = lc($wiim->id() || '');
    my $ip = eval { $wiim->ip() } || '';
    $ip =~ s/:\d+$//;
    my $st = eval { Plugins::WiimIntegration::DlnaRenderer::status() } || {};
    my $uri = $st->{uri} || '';
    if ($uri =~ m{^https?://}i) {
        return $uri if $st->{source_id} && lc($st->{source_id}) eq $id;
        my ($host) = $uri =~ m{^https?://([^/:]+)}i;
        return $uri if $ip && $host && lc($host) eq lc($ip);
        # Another player owns the current cast.
        return '';
    }
    my $saved = eval { $prefs->get('dlna_last_uri') };
    if (ref $saved eq 'HASH' && ($saved->{uri} || '') =~ m{^https?://}i) {
        my $suri = $saved->{uri};
        my ($host) = $suri =~ m{^https?://([^/:]+)}i;
        return $suri if $saved->{source_id} && lc($saved->{source_id}) eq $id;
        return $suri if $ip && $host && lc($host) eq lc($ip);
        return $suri if $ip && ($saved->{peer} || '') eq $ip;
        return '';
    }
    # Restart cleared the cast, and the WiiM is still serving :8086.
    return "http://$ip:8086/stream.flac" if $ip =~ /^\d+\.\d+\.\d+\.\d+$/;
    return '';
}

# VLC plays stream.flac mid-stream, with no fLaC header. LMS will not start
# that. stream.mp3 is the same program and begins with an ID3 tag.
sub _upstreamForLms {
    my $url = shift || return '';
    $url =~ s{/stream\.flac\b}{/stream.mp3}i;
    return $url;
}

sub _playDirectOn {
    my ($dest, $wiim) = @_;
    return 0 unless $dest && $wiim;
    my $url = _directStreamUrl($wiim);
    return 0 unless $url;
    # Remember the WiiM input before the first destination starts. A later
    # reset puts that input back and drops the relay from those queues.
    _diffuseRememberSource($wiim);
    my $st = eval { Plugins::WiimIntegration::DlnaRenderer::status() } || {};
    _dlnaSetTarget(lc($dest->id() || ''), 1);
    _dlnaPlayOn($dest, $url, {
        title  => $st->{title}  || '',
        artist => $st->{artist} || '',
        album  => '',
        cover  => $st->{cover}  || '',
    });
    return 1;
}

sub _streamTitle {
    my $client = shift || return 'WiiM Stream';
    my $name = $client->name() || 'WiiM';
    return "$name (LMS Stream)";
}

sub _addFavoriteUrl {
    my ($fav_client, $url, $title) = @_;
    return { ok => 0, msg => 'Favorites plugin is not enabled' }
        unless Slim::Utils::Favorites->enabled;
    return { ok => 0, msg => 'No player selected' } unless $fav_client;
    return { ok => 0, msg => 'Invalid stream URL' } unless $url;

    my $favs = Slim::Utils::Favorites->new($fav_client);
    return { ok => 0, msg => 'Favorites unavailable' } unless $favs;

    if ($favs->hasUrl($url)) {
        return { ok => 1, msg => "Already bookmarked: $title" };
    }

    my $index = $favs->add($url, $title, 'audio');
    return { ok => 0, msg => 'Failed to add bookmark' } unless defined $index;

    $log->info("Bookmarked stream for " . $fav_client->name() . ": $title");
    return { ok => 1, msg => "Bookmarked: $title" };
}

sub _addStreamBookmark {
    my ($fav_client, $wiim_client) = @_;
    return { ok => 0, msg => 'No WiiM player selected' } unless $wiim_client;
    return _addFavoriteUrl($fav_client, _streamUrl($wiim_client), _streamTitle($wiim_client));
}

sub _webEscape {
    my $text = shift // '';
    $text =~ s/&/&amp;/g;
    $text =~ s/</&lt;/g;
    $text =~ s/>/&gt;/g;
    $text =~ s/"/&quot;/g;
    return $text;
}

sub _webPlayerQuery {
    my $client = shift || return '';
    my $id = $client->id() || return '';
    return 'player=' . uri_escape_utf8($id);
}

sub _webLink {
    my ($path, $player_q, %params) = @_;
    my $url = "plugins/WiimIntegration/$path";
    my @parts = grep { defined $_ && $_ ne '' } (
        $player_q,
        map { $_ . '=' . uri_escape_utf8($params{$_}) } sort keys %params
    );
    $url .= '?' . join('&', @parts) if @parts;
    return $url;
}

sub _webSendHtml {
    my ($callback, $client, $params, $httpClient, $response, $html) = @_;
    $response->code(200);
    $response->content_type('text/html');
    $callback->($client, $params, \$html, $httpClient, $response);
}

sub _webHtmlPage {
    my ($title, $items, $back) = @_;
    $title = _webEscape($title);
    my $body = '';
    foreach my $item (@{ $items || [] }) {
        my $name = _webEscape($item->{name} // '');
        if ($item->{url}) {
            if ($item->{url} =~ m{^https?://}i) {
                $body .= qq{<li><a href="} . _webEscape($item->{url}) . qq{">$name</a></li>\n};
            }
            else {
                $body .= qq{<li><a href="/} . _webEscape($item->{url}) . qq{">$name</a></li>\n};
            }
        }
        else {
            $body .= qq{<li>$name</li>\n};
        }
    }
    my $back_html = '';
    if ($back && $back->{url}) {
        $back_html = qq{<p><a href="/} . _webEscape($back->{url}) . qq{">&larr; } .
            _webEscape($back->{name} // '') . qq{</a></p>};
    }
    return <<"HTML";
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<style>
body { font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 1rem; }
h1 { font-size: 1.2rem; margin: 0 0 1rem; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 0.5rem 0; }
a { color: #1976d2; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>$title</h1>
$back_html
<ul>
$body
</ul>
</body>
</html>
HTML
}

sub _webExtrasPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    my $context = _webContextClient($client, $params);
    my $title = _menuText($context, 'WIIM_EXTRAS', 'Wiim Extras');
    my @items;

    if ($context && isWiimPlayer($context)) {
        my $q = _webPlayerQuery($context);
        @items = (
            { name => _menuText($context, 'SELECT_SOURCE', 'Select Source'), url => _webLink('sources.html', $q) },
            { name => _menuText($context, 'SELECT_PRESET', 'Select Preset'), url => _webLink('presets.html', $q) },
        );
        push @items, {
            name => _menuText($context, 'SELECT_LINEOUT', 'Select Line Out'),
            url  => _webLink('lineout.html', $q),
        } if _lineoutModes($context);
        push @items, {
            name => _menuText($context, 'DLNA_RENDERER', 'DLNA redistribution'),
            url  => _webLink('dlna.html', $q),
        };
    }
    elsif ($context) {
        my $q = _webPlayerQuery($context);
        my @wiim_clients = _allWiimClients();

        if (@wiim_clients) {
            push @items, { name => _menuText($context, 'WIIM_STREAMS', 'WiiM Streams') };
            foreach my $wiim (@wiim_clients) {
                my $name = $wiim->name() || $wiim->id();
                my $direct = _directStreamUrl($wiim);
                if ($direct) {
                    push @items, {
                        name => "$name - " . _menuText($context, 'STREAM_LISTEN', 'Listen'),
                        url  => _webLink('action.html', $q, action => 'listen', value => $wiim->id()),
                    };
                }
                else {
                    push @items, {
                        name => "$name - " . _menuText($context, 'STREAM_NO_HTTP', 'No HTTP stream to play here'),
                    };
                }
            }
        }
        else {
            push @items, { name => _menuText($context, 'NO_WIIM_PLAYERS', 'No WiiM players found') };
        }
        push @items, {
            name => _menuText($context, 'DLNA_RENDERER', 'DLNA redistribution'),
            url  => _webLink('dlna.html', $q),
        };
    }
    else {
        push @items, { name => 'No player selected' };
    }

    _webSendHtml($callback, $context, $params, $httpClient, $response, _webHtmlPage($title, \@items));
}

sub _webDlnaPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    my $context = _webContextClient($client, $params);
    my $op = _webParam($params, 'op');
    my $target = lc(_webParam($params, 'target') || '');
    if ($target && ($op eq 'on' || $op eq 'off')) {
        _dlnaSetTarget($target, $op eq 'on' ? 1 : 0);
        my $dest = Slim::Player::Client->getClient($target);
        if ($dest && $op eq 'on') {
            Plugins::WiimIntegration::DlnaRenderer::catch_up($dest);
        }
        elsif ($dest && $op eq 'off') {
            my $st = Plugins::WiimIntegration::DlnaRenderer::status();
            _dlnaTransportOn($dest, 'stop', $st->{uri}) if $st && $st->{uri};
        }
    }

    my $title = _menuText($context, 'DLNA_RENDERER', 'DLNA redistribution');
    my $st = Plugins::WiimIntegration::DlnaRenderer::status();
    my @items;
    my $ssdp = $st->{ssdp}
        ? _menuText($context, 'DLNA_SSDP_ON', 'Visible on the network')
        : _menuText($context, 'DLNA_SSDP_OFF', 'Network announcement failed');
    push @items, { name => ($st->{name} || 'Lyrion') . ' — ' . $ssdp };
    my $line = $st->{transport} || 'STOPPED';
    my $who = join(' — ', grep { $_ } ($st->{artist}, $st->{title}));
    $line .= ' — ' . $who if $who;
    push @items, { name => $line };
    push @items, { name => $st->{uri} } if $st->{uri};

    my $q = $context ? _webPlayerQuery($context) : '';
    my @cands = _dlnaCandidates();
    if (!@cands) {
        push @items, { name => _menuText($context, 'DLNA_NO_PLAYERS', 'No other Lyrion player is connected') };
    }
    foreach my $dest (@cands) {
        my $id = lc($dest->id() || '');
        next unless $id;
        my $on = _dlnaTargetOn($id);
        my $verb = $on
            ? _menuText($context, 'DLNA_RENDERER_OFF', 'Stop receiving')
            : _menuText($context, 'DLNA_RENDERER_ON', 'Receive the WiiM stream');
        push @items, {
            name => ($dest->name() || $id) . ' — ' . $verb,
            url  => _webLink('dlna.html', $q, op => ($on ? 'off' : 'on'), target => $id),
        };
    }

    my $back = $context ? {
        name => _menuText($context, 'WIIM_EXTRAS', 'Wiim Extras'),
        url  => _webLink('extras.html', $q),
    } : undef;
    _webSendHtml($callback, $context, $params, $httpClient, $response, _webHtmlPage($title, \@items, $back));
}

sub _webSourcesPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    $client = _webClient($client, $params);
    my $title = _menuText($client, 'SELECT_SOURCE', 'Select Source');
    my @items;

    if ($client) {
        my $q = _webPlayerQuery($client);
        @items = map {
            { name => $_->{label}, url => _webLink('action.html', $q, action => 'source', value => $_->{cmd}) }
        } _sourceModes($client);
    }
    else {
        push @items, { name => 'Not a WiiM player' };
    }

    my $back = $client ? {
        name => _menuText($client, 'WIIM_EXTRAS', 'Wiim Extras'),
        url  => _webLink('extras.html', _webPlayerQuery($client)),
    } : undef;

    _webSendHtml($callback, $client, $params, $httpClient, $response, _webHtmlPage($title, \@items, $back));
}

sub _webPresetsPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    $client = _webClient($client, $params);
    my $title = _menuText($client, 'SELECT_PRESET', 'Select Preset');
    my @items;

    if ($client) {
        my $q = _webPlayerQuery($client);
        my $presets = $playerState{$client->id()}{presets} || [];
        if (@$presets) {
            @items = map {
                { name => $_->{name} || "Preset $_->{number}",
                  url  => _webLink('action.html', $q, action => 'preset', value => $_->{number}) }
            } @$presets;
        }
        else {
            @items = map {
                { name => "Preset $_", url => _webLink('action.html', $q, action => 'preset', value => $_) }
            } 1 .. 6;
        }
    }
    else {
        push @items, { name => 'Not a WiiM player' };
    }

    my $back = $client ? {
        name => _menuText($client, 'WIIM_EXTRAS', 'Wiim Extras'),
        url  => _webLink('extras.html', _webPlayerQuery($client)),
    } : undef;

    _webSendHtml($callback, $client, $params, $httpClient, $response, _webHtmlPage($title, \@items, $back));
}

sub _webLineoutPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    $client = _webClient($client, $params);
    my $title = _menuText($client, 'SELECT_LINEOUT', 'Select Line Out');
    my @items;

    if ($client) {
        my $q = _webPlayerQuery($client);
        my $current = _getLineoutMode($client);
        $current =~ s/\D//g if defined $current && $current ne '';

        my @modes = _lineoutModes($client);
        if (@modes) {
            @items = map {
                my $label = $_->{label};
                $label .= ' (current)' if defined $current && $current ne '' && $_->{cmd} eq $current;
                { name => $label, url => _webLink('action.html', $q, action => 'lineout', value => $_->{cmd}) }
            } @modes;
        }
        else {
            @items = ({ name => 'No switchable output' });
        }

        if (@modes && defined $current && $current ne '' && !_validLineout($client, $current)) {
            unshift @items, { name => _lineoutLabel($current) . ' (current)' };
        }
    }
    else {
        push @items, { name => 'Not a WiiM player' };
    }

    my $back = $client ? {
        name => _menuText($client, 'WIIM_EXTRAS', 'Wiim Extras'),
        url  => _webLink('extras.html', _webPlayerQuery($client)),
    } : undef;

    _webSendHtml($callback, $client, $params, $httpClient, $response, _webHtmlPage($title, \@items, $back));
}

sub _webActionPage {
    my ($client, $params, $callback, $httpClient, $response) = @_;
    my $context = _webContextClient($client, $params);
    my $title = _menuText($context, 'WIIM_EXTRAS', 'Wiim Extras');
    my @items;
    my $action = $params->{action} // '';
    $action = _webParam($params, 'action') if $action eq '';
    my $value  = _webParam($params, 'value');

    if ($action eq 'listen') {
        my $wiim = _wiimClientById($value);
        if ($context && $wiim && _playDirectOn($context, $wiim)) {
            my $st = Plugins::WiimIntegration::DlnaRenderer::status();
            push @items, { name => ($wiim->name() || '') . ' — ' . (($st && $st->{title}) || _directStreamUrl($wiim)) };
        }
        else {
            push @items, { name => _menuText($context, 'STREAM_NO_HTTP', 'No HTTP stream to play here') };
        }
    }
    elsif ($action eq 'bookmark') {
        my $wiim_id = _webParam($params, 'wiimid') || $value || '';
        my $wiim = $wiim_id ? _wiimClientById($wiim_id) : $context;
        if ($wiim && isWiimPlayer($wiim)) {
            my $result = _addStreamBookmark($context, $wiim);
            push @items, { name => $result->{msg} };
        }
        else {
            push @items, { name => 'WiiM player not found' };
        }
    }
    elsif (my $wiim = _webClient($client, $params)) {
        if ($action eq 'source' && _validSource($wiim, $value)) {
            switchSource($wiim, $value);
            push @items, { name => string('SELECT_SOURCE') . ': ' . $value };
        }
        elsif ($action eq 'preset' && $value =~ /^\d+$/) {
            playPreset($wiim, $value);
            push @items, { name => string('SELECT_PRESET') . " $value" };
        }
        elsif ($action eq 'lineout' && _validLineout($wiim, $value)) {
            setLineout($wiim, $value);
            push @items, { name => string('SELECT_LINEOUT') . ': ' . _lineoutLabel($value) };
        }
        else {
            push @items, { name => 'Unknown action' };
        }
    }
    else {
        push @items, { name => 'Not a WiiM player' };
    }

    my $back = $context ? {
        name => $title,
        url  => _webLink('extras.html', _webPlayerQuery($context)),
    } : undef;

    _webSendHtml($callback, $context, $params, $httpClient, $response, _webHtmlPage($title, \@items, $back));
}

sub _parseVolumeArg {
    my $arg = shift;
    return { mode => 'delta', value => 0 } unless defined $arg && $arg ne '';

    if ($arg =~ /^\+(\d+(?:\.\d+)?)$/) {
        return { mode => 'delta', value => 0 + $1 };
    }
    if ($arg =~ /^-(\d+(?:\.\d+)?)$/) {
        return { mode => 'delta', value => 0 - $1 };
    }
    if ($arg =~ /^-?\d+(?:\.\d+)?$/) {
        return { mode => 'absolute', value => int($arg + 0.5) };
    }
    return { mode => 'delta', value => 0 };
}

sub _clampVolume {
    my $vol = shift;
    $vol = 0 unless defined $vol && $vol ne '';
    $vol = int($vol + 0.5);
    $vol = 0   if $vol < 0;
    $vol = 100 if $vol > 100;
    return $vol;
}

# Pref only. $client->volume() also sends an audg frame, and the poll used to
# write WiiM's vol back the same way. The two knobs chase each other.
sub _setVolumePref {
    my ($client, $vol) = @_;
    return unless $client;
    $vol = _clampVolume($vol);
    my $cprefs = preferences('server')->client($client);
    my $cur = $cprefs->get('volume');
    return if defined $cur && $cur ne '' && int($cur) == $vol;
    $cprefs->set('volume', $vol);
}

# Adopt WiiM's reported volume only while it is the device we hear.
# During LMS playback the poll used to call $client->volume(), which sends
# audg, and the slider then walked up and down against setPlayerCmd.
sub _noteDeviceVolume {
    my ($client, $reported, $external) = @_;
    return unless $client && defined $reported && $reported ne '';
    my $vol = _clampVolume($reported);
    my $id = $client->id();
    $playerState{$id}{device_volume} = $vol;
    return unless $external;

    my $hold   = $playerState{$id}{volume_hold_until} || 0;
    my $target = $playerState{$id}{volume_target};
    return if time() < $hold && defined $target && $vol != $target;
    return if defined $playerState{$id}{volume} && $playerState{$id}{volume} == $vol;

    $playerState{$id}{volume} = $vol;
    delete $playerState{$id}{volume_target} if !defined $target || $vol == $target || time() >= $hold;
    _setVolumePref($client, $vol);
}

sub _setWiimVolume {
    my ($client, $vol) = @_;
    return unless $client;
    $vol = _clampVolume($vol);

    my $id = $client->id();
    $playerState{$id}{volume} = $vol;
    $playerState{$id}{volume_target} = $vol;
    # Ignore stale getPlayerStatus vol until the device has caught up.
    $playerState{$id}{volume_hold_until} = time() + 2.5;
    _setVolumePref($client, $vol);
    apiCall($client, "setPlayerCmd:vol:$vol");
}

sub wiimMixerVolume {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    unless (isWiimPlayer($client)) {
        $originalMixerVolume->($request) if $originalMixerVolume;
        return;
    }

    my $id  = $client->id();
    my $arg = $request->getParam('_newvalue');

    # While squeezelite is the renderer, LMS volume is the only knob.
    # Sending setPlayerCmd as well, then copying WiiM vol back, oscillates.
    unless ($playerState{$id}{is_external}) {
        $originalMixerVolume->($request) if $originalMixerVolume;
        return;
    }

    if (!defined $arg || $arg eq '' || $arg eq '?') {
        $originalMixerVolume->($request) if $originalMixerVolume;
        return;
    }

    my $cur = $playerState{$id}{volume_target};
    $cur = $playerState{$id}{volume} if !defined $cur;
    $cur = $client->volume() if !defined $cur || $cur eq '';
    $cur = 0 unless defined $cur && $cur ne '';

    my $parsed = _parseVolumeArg($arg);
    my $vol = $parsed->{mode} eq 'absolute' ? $parsed->{value} : $cur + $parsed->{value};
    _setWiimVolume($client, $vol);
    $request->setStatusDone();
}

sub wiimMixerMuting {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    unless (isWiimPlayer($client) && $playerState{$client->id}{is_external}) {
        $originalMixerMuting->($request) if $originalMixerMuting;
        return;
    }

    my $mute = $request->getParam('_newvalue');
    $mute = ($client->volume() || 0) < 0 ? 0 : 1 if !defined $mute || $mute eq 'toggle';
    apiCall($client, 'setPlayerCmd:mute:' . ($mute ? 1 : 0));
    $request->setStatusDone();
}

sub _shouldForwardTransport {
    my $client = shift || return 0;
    return 0 unless isWiimPlayer($client);
    my $id = $client->id() || return 0;
    # Never steal transport while LMS owns the device (queue / sync / takeover).
    return 0 if _lmsOwnsPlayback($client);
    return $playerState{$id}{is_external} ? 1 : 0;
}

sub _wiimTransportCmd {
    my ($client, $cmd) = @_;
    apiCall($client, $cmd);
    _scheduleStatusRefresh($client, 0.5);
}

sub wiimPlaylistJump {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    my $index = $request->getParam('_index') // $request->getRequest(2) // '';

    # Absolute jump / play-from-index is always an LMS action (Play now, queue tap).
    # Relative ±1 while purely external maps to WiiM next/prev.
    my $is_relative = (defined $index && ($index eq '+1' || $index eq '-1' || $index =~ /^[+-]\d+$/));

    if ($is_relative && _shouldForwardTransport($client)) {
        if ($index eq '+1' || $index =~ /^\+/) {
            _wiimTransportCmd($client, 'setPlayerCmd:next');
        }
        else {
            _wiimTransportCmd($client, 'setPlayerCmd:prev');
        }
        $request->setStatusDone();
        return;
    }

    # Leaving external for LMS playlist navigation (absolute jump = LMS queue).
    if ($playerState{$client->id()}{is_external} || _isLiveInputMode($playerState{$client->id()}{mode} // '')) {
        _takeLmsPlaylistControl($client, 1);
    }

    $originalPlaylistJump->($request) if $originalPlaylistJump;
}

sub wiimButton {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    my $button = $request->getParam('_buttoncode') || '';
    if (_shouldForwardTransport($client) && ($button eq 'jump_fwd' || $button eq 'jump_rew')) {
        _wiimTransportCmd(
            $client,
            $button eq 'jump_fwd' ? 'setPlayerCmd:next' : 'setPlayerCmd:prev'
        );
        $request->setStatusDone();
        return;
    }

    $originalButton->($request) if $originalButton;
}

sub wiimPlay {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    my $id   = $client->id();
    my $mode = $playerState{$id}{mode} // '';
    $mode =~ s/\D//g if defined $mode;

    # User queued / is playing real LMS content (e.g. just added a playlist while
    # on Bluetooth) — always prefer LMS play + wifi takeover over WiiM resume.
    if (_hasRealLmsPlaylist($client) || _lmsTakeoverPending($id) || $playerState{$id}{pending_lms_play}) {
        _takeLmsPlaylistControl($client, 1);
        $playerState{$id}{pending_lms_play} = 1;
        $originalPlay->($request) if $originalPlay;
        Slim::Utils::Timers::setTimer($client, time() + 0.8, \&_maybeStartLmsPlayback, $client);
        Slim::Utils::Timers::setTimer($client, time() + 2.0, \&_maybeStartLmsPlayback, $client);
        return;
    }

    # Pure external (no LMS queue): resume WiiM, do not steal with switchmode:wifi
    # (Material/LMS often emit bare "play" on reconnect).
    if (_shouldForwardTransport($client)
        || _isLiveInputMode($mode)
        || ($mode ne '' && $EXTERNAL_MODES{$mode})) {
        _wiimTransportCmd($client, 'setPlayerCmd:resume');
        $playerState{$id}{play_state} = 'play';
        $request->setStatusDone();
        return;
    }

    $originalPlay->($request) if $originalPlay;
}

sub wiimPause {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();

    # Pausing while a real LMS queue is active / takeover pending → LMS, not WiiM BT.
    if (_hasRealLmsPlaylist($client) || _lmsTakeoverPending($client->id)
        || $playerState{$client->id()}{pending_lms_play}) {
        $originalPause->($request) if $originalPause;
        return;
    }

    if (_shouldForwardTransport($client)) {
        _wiimTransportCmd($client, 'setPlayerCmd:pause');
        $request->setStatusDone();
        return;
    }

    $originalPause->($request) if $originalPause;
}

sub handlePlaylistEvent {
    my $request = shift;
    my $client  = $request->client() || return;

    return unless isWiimPlayer($client);
    return if $playerState{$client->id}{lms_transfer_pending};
    return if $playerState{$client->id}{suppress_playlist_hook};

    my $cmd = $request->getRequest(1) || '';
    # Only real content loads force wifi. Bare play/resume is often emitted on
    # reconnect and must not kill AirPlay (see wiimPlay).
    if ($cmd =~ /^(?:add|insert|load|playtracks|addtracks|loadtracks)$/ || $cmd eq 'playlistcontrol') {
        my $st = $playerState{$client->id()} || {};
        if ($st->{is_external} || _upnpAppStreamActive($client->id())
                || (($st->{mode} || '') =~ /^(?:31|32|34|36|47)$/ && ($st->{play_state} || '') eq 'play')) {
            $log->info('Skip LMS wifi takeover on playlist restore ('
                . ($client->name() || '') . " mode=" . ($st->{mode} // '') . ')');
            return;
        }
        _takeLmsPlaylistControl($client, 1);
        return;
    }

    return if _lmsTakeoverPending($client->id);
    return unless $playerState{$client->id}{is_external};

    _scheduleStatusRefresh($client, 0.3);
}

sub _scheduleStatusRefresh {
    my ($client, $delay) = @_;
    return unless $client;

    Slim::Utils::Timers::killTimers($client, \&_refreshExternalStatus);
    Slim::Utils::Timers::setTimer($client, time() + ($delay // 0.3), \&_refreshExternalStatus, $client);
}

sub _upnpAppStreamActive {
    my $id = shift // '';
    return 0 unless $id && $playerState{$id}{upnp_app};
    my $until = $playerState{$id}{upnp_app_until} || 0;
    return $until && time() < $until ? 1 : 0;
}

# GENA notify callback (mac, meta). Resolve the player then apply metadata.
sub _onUPnPEvent {
    my ($mac, $upnp) = @_;
    return unless $upnp && ref $upnp eq 'HASH';
    my $client;
    $client = Slim::Player::Client->getClient($mac) if $mac;
    $client ||= Slim::Player::Client->getClient(lc($mac)) if $mac;
    unless ($client) {
        my @wiims = grep { isWiimPlayer($_) } Slim::Player::Client::clients();
        $client = $wiims[0] if @wiims == 1;
    }
    return unless $client && isWiimPlayer($client);
    _onUPnPMetadata($client, $upnp);
}

# Immediate GetInfoEx (empty LastChange DIDL, or title without cover).
sub _fetchUpnpNow {
    my ($client, $reason) = @_;
    return unless $client && $prefs->get('enable_upnp');
    my $id = $client->id() || return;
    return if $playerState{$id}{upnp_fetch_busy};
    my $last = $playerState{$id}{upnp_fetch_at} || 0;
    my $min  = ($reason && $reason =~ /cover/) ? 5 : 8;
    return if $last && (Time::HiRes::time() - $last) < $min;
    $playerState{$id}{upnp_fetch_busy} = 1;
    $playerState{$id}{upnp_fetch_at}   = Time::HiRes::time();
    Plugins::WiimIntegration::UPnPHelper::getStatus($client, sub {
        delete $playerState{$id}{upnp_fetch_busy};
        my $upnp = shift || return;
        $upnp->{_from_getinfo} = 1;
        _onUPnPMetadata($client, $upnp);
    });
}

# UPnP AVTransport (event or GetInfoEx) is the source of truth for Spotify Connect.
sub _onUPnPMetadata {
    my ($client, $upnp) = @_;
    return unless $client && $upnp && ref $upnp eq 'HASH';
    # Powered off in Lyrion: keep the device metadata, but do not present it
    # as On/playing. The status query forces power=0 / mode=off.

    my $id = $client->id() || return;
    my $title  = _cleanMetaField($upnp->{title}  || '');
    my $artist = _cleanMetaField($upnp->{artist} || '');
    my $album  = _cleanMetaField($upnp->{album}  || '');
    my $cover  = _cleanCover($upnp->{cover} || '');
    my $state  = lc($upnp->{transport} || $upnp->{status} || '');
    my $source = $upnp->{source} || '';
    my $from_info = $upnp->{_from_getinfo} ? 1 : 0;

    $playerState{$id}{upnp_event_at} = time();

    # Same track every few seconds (Bluetooth position ticks). Doing the full
    # path each time logged, refreshed controllers, and kept a core busy.
    my $cover_key = $cover;
    $cover_key =~ s/\?.*//;
    my $sig = join("\t", $title, $artist, $album, $cover_key, $source, $state);
    if (($playerState{$id}{upnp_sig} || '') eq $sig) {
        $playerState{$id}{upnp_app_until} = time() + 90 if $playerState{$id}{upnp_app};
        return;
    }

    if ($state =~ /stop/) {
        $playerState{$id}{power_off_seen_idle} = 1 if _userPowerOff($client);
        delete $playerState{$id}{upnp_app};
        delete $playerState{$id}{upnp_app_until};
        delete $playerState{$id}{upnp_sig};
        $playerState{$id}{play_state} = 'stop';
        Plugins::WiimIntegration::DlnaRenderer::note_source($client);
        return;
    }

    my $playing = ($state =~ /play/ || $state eq '' || $state eq 'pause' || $state eq 'paused');
    return unless $playing;

    # Off in Lyrion: remember the device track, but do not present it until
    # stop+standby has landed and the WiiM is playing again. That follow does
    # not send a Lyrion power or play command.
    if (_userPowerOff($client)) {
        my $was_idle = $playerState{$id}{power_off_seen_idle} ? 1 : 0;
        my $active = ($state =~ /play/ || $state eq 'pause' || $state eq 'paused') ? 1 : 0;
        my $ready = $was_idle || _powerOffGraceOver($id);
        if (!$ready || !$active || !_hasRealTrackMeta($title, $artist)) {
            if (_hasRealTrackMeta($title, $artist)) {
                $playerState{$id}{remoteMeta} = {
                    title      => $title,
                    artist     => $artist,
                    album      => $album,
                    cover      => $cover,
                    type       => 'wiim',
                    mode       => $source || 'External',
                    live_input => 0,
                };
                $playerState{$id}{upnp_sig} = $sig;
            }
            return;
        }
        _setUserPowerOff($client, 0);
        $log->info('UPnP playback while Lyrion was off — following '
            . ($client->name() || $id));
    }

    # LastChange often has PLAYING and no DIDL — fetch GetInfoEx instead of waiting for HTTP poll.
    unless (_hasRealTrackMeta($title, $artist)) {
        _fetchUpnpNow($client, 'empty-didl') unless $from_info;
        if ($cover) {
            my $prev = $playerState{$id}{remoteMeta} || {};
            if ($prev->{title} && $cover ne ($prev->{cover} || '')) {
                $prev->{cover} = $cover;
                _storeAndOverlay($client, $prev, 1) if $playerState{$id}{is_external};
            }
        }
        return;
    }

    return if _statusLooksLikeLmsLeftover($client, { title => $title, artist => $artist });
    return if _upnpIsLmsRendererMirror($client, $title, $source);

    my $mode_now = $playerState{$id}{mode} // '';
    $mode_now =~ s/\D//g;
    my $app_takeover = ($source =~ /spotify|airplay|tidal|qobuz|roon/i)
        || ($mode_now =~ /^(?:31|32|34|36|47)$/);

    # Connect/AirPlay DIDL is the user taking the speaker. Do not wait out the
    # 20s LMS commit / 90s playlist-control window (that delayed np-bar ~22s).
    # But never steal a live LMS renderer — Spotty DIDL looks like Connect.
    if (_lmsHoldsRenderer($client)) {
        $log->debug('Ignore UPnP app stream on ' . ($client->name() || $id)
            . ' (LMS renderer still active)');
        return;
    }
    if ($app_takeover && _blocksExternalInject($client, $playerState{$id}{mode})) {
        $log->info('UPnP app stream overriding LMS inject block on '
            . ($client->name() || $id));
        _clearLmsTakeoverLocks($client, 'UPnP app stream');
    }
    elsif (!_blocksExternalInject($client, $playerState{$id}{mode})) {
        # ok to inject
    }
    else {
        return;
    }

    $playerState{$id}{upnp_app}       = 1;
    $playerState{$id}{upnp_app_until} = time() + 90;
    $playerState{$id}{is_external}    = 1;
    $playerState{$id}{play_state}     = ($state =~ /pause/) ? 'pause' : 'play';
    $playerState{$id}{external_hits}  = $EXTERNAL_CONFIRM_POLLS;

    if ($source =~ /spotify/i) {
        $playerState{$id}{mode_name} = 'Spotify';
    }
    elsif ($source =~ /airplay/i) {
        $playerState{$id}{mode_name} = 'AirPlay';
    }
    elsif ($source =~ /tidal/i) {
        $playerState{$id}{mode_name} = 'TIDAL';
    }
    elsif ($source =~ /qobuz/i) {
        $playerState{$id}{mode_name} = 'Qobuz';
    }
    elsif (!$playerState{$id}{mode_name} || $playerState{$id}{mode_name} eq 'Wi-Fi'
            || $playerState{$id}{mode_name} eq 'Network') {
        $playerState{$id}{mode_name} = 'External';
    }

    my $meta = {
        title      => $title,
        artist     => $artist,
        album      => $album,
        cover      => $cover,
        type       => 'wiim',
        mode       => $playerState{$id}{mode_name} || 'External',
        live_input => 0,
        trackid    => $upnp->{trackid} || '',
    };
    $playerState{$id}{upnp_sig} = $sig;
    $log->info('UPnP app stream on ' . ($client->name() || $id)
        . ' [' . ($meta->{mode} || '') . '] ' . join(' - ', grep { $_ } ($artist, $title)));
    _storeAndOverlay($client, $meta, 1);
    if (!$playerState{$id}{remoteMeta}{cover}) {
        _fetchUpnpNow($client, 'need-cover') unless $from_info;
        _fetchMetaCover($client);
    }
}

sub _refreshExternalStatus {
    my $client = shift || return;
    return unless isWiimPlayer($client);
    # Also when the player is off in Lyrion, or playing through LMS.
    # Status subscribers re-query on this notification.

    # playerStatusHeartbeat runs the squeezelite state machine, and together
    # with showBriefly it forces Now Playing on a Squeezebox Radio so the menu
    # will not take a button. The status query below is a normal remote track,
    # which is the screen the Radio already uses for an LMS stream.
    Slim::Control::Request::notifyFromArray($client, ['wiimintegration', 'metadata']);
}

sub getFunctions { return {} }

sub exitMode {
    my ($class, $client) = @_;
    $client->modeParam('wiim_submenu', undef);
}

sub setMode {
    my ($class, $client) = @_;
    my $method = shift;

    if ($method && $method eq 'pop') {
        if ($client->modeParam('wiim_submenu')) {
            $client->modeParam('wiim_submenu', undef);
            $class->setMode($client);
            return;
        }
        Slim::Buttons::Common::popMode($client);
        return;
    }

    my $sub = $client->modeParam('wiim_submenu') || 'main';

    if ($sub eq 'main') {
        Slim::Buttons::Common::pushMode($client, 'INPUT.Choice', {
            header    => '{WIIM_EXTRAS}',
            listRef   => [
                { name => '{SELECT_SOURCE}', value => 'source' },
                { name => '{SELECT_PRESET}', value => 'preset' },
            ],
            onPlay    => \&_menuSelected,
            modeName  => 'Wiim Integration',
        });
        return;
    }

    if ($sub eq 'source') {
        my @items = map { { name => $_->{label}, value => $_->{cmd} } } _sourceModes($client);
        Slim::Buttons::Common::pushMode($client, 'INPUT.Choice', {
            header   => '{SELECT_SOURCE}',
            listRef  => \@items,
            onPlay   => \&_sourceSelected,
            modeName => 'Wiim Integration Source',
        });
        return;
    }

    if ($sub eq 'preset') {
        _showPresetMenu($client);
    }
}

sub _menuSelected {
    my ($client, $item) = @_;
    return unless $item && $item->{value};
    $client->modeParam('wiim_submenu', $item->{value});
    __PACKAGE__->setMode($client);
}

sub _sourceSelected {
    my ($client, $item) = @_;
    return unless $item && $item->{value};
    switchSource($client, $item->{value});
    Slim::Buttons::Common::popMode($client);
    $client->modeParam('wiim_submenu', undef);
}

sub _validSource {
    my ($client, $src) = @_;
    return unless $src;
    $src = 'hdmi' if $src eq 'tv';
    return grep { $_->{cmd} eq $src } _sourceModes($client);
}

sub _validLineout {
    my ($client, $mode) = @_;
    $mode = '' unless defined $mode;
    $mode =~ s/\D//g;
    return if $mode eq '';
    return grep { $_->{cmd} eq $mode } _lineoutModes($client);
}

sub _lineoutLabel {
    my $mode = shift // '';
    $mode =~ s/\D//g;
    foreach my $item (@LINEOUT_MODES) {
        return $item->{label} if $item->{cmd} eq $mode;
    }
    return "Output $mode";
}

sub _wiimHost {
    my $client = shift || return;
    my $id = eval { $client->id() } || '';
    my $ip = eval { $client->ip() } || '';
    $ip =~ s/:\d+$//;
    if ($ip ne '') {
        $playerState{$id}{host} = $ip if $id ne '';
        return $ip;
    }
    # Squeezelite drops in standby. The WiiM HTTP API stays on the last address.
    return $playerState{$id}{host} if $id ne '' && ($playerState{$id}{host} || '') ne '';
    return;
}

sub _refreshLineoutMode {
    my $client = shift || return;

    apiCall($client, 'getNewAudioOutputHardwareMode', sub {
        my $data = shift || return;
        return unless ref $data eq 'HASH';

        my $mode = $data->{hardware};
        $mode =~ s/\D//g if defined $mode;
        $playerState{$client->id()}{lineout_mode} = $mode if defined $mode && $mode ne '';
    });
}

sub _getLineoutMode {
    my $client = shift || return;
    my $id = $client->id() || return;

    _refreshLineoutMode($client) unless exists $playerState{$id}{lineout_mode};
    return $playerState{$id}{lineout_mode};
}

sub setLineout {
    my ($client, $mode) = @_;
    return unless _validLineout($client, $mode);
    $mode =~ s/\D//g;

    my $label = _lineoutLabel($mode);
    $log->info("Setting " . $client->name() . " line out to $label ($mode)");
    $playerState{$client->id()}{lineout_mode} = $mode;
    apiCall($client, "setAudioOutputHardwareMode:$mode", sub {
        $client->showBriefly({ line => [$label] });
        _refreshLineoutMode($client);
    });
}

sub switchSource {
    my ($client, $src) = @_;
    $src = 'hdmi' if defined $src && $src eq 'tv';
    return unless _validSource($client, $src);

    my $id = $client->id();
    if ($src eq 'wifi') {
        # Physical / HTTP source→LMS: hold off residual BT and the Network-mode
        # blip that used to inject a fake AirPlay track.
        _markLmsCommit($client, 'switchSource:wifi');
        if (_hasRealLmsPlaylist($client)) {
            _takeLmsPlaylistControl($client, 1);
            $client->showBriefly({ line => ["Source: $src"] });
            _ensureMonitor($client);
            return;
        }
        $playerState{$id}{is_external} = 0;
        $playerState{$id}{external_hits} = 0;
        delete $playerState{$id}{remoteMeta};
    }
    else {
        # Leaving LMS/Wi-Fi path — drop takeover lock so external UI returns.
        _clearLmsTakeoverLocks($client, "switchSource:$src");
        delete $playerState{$id}{left_live_at};
        _setUserPowerOff($client, 0);

        # Optimistic live-input UI so Material does not flap play→pause→play
        # while WiiM briefly reports stop after switchmode.
        if (my $mode_num = $SOURCE_CMD_MODE{$src}) {
            my $label = _modeLabel($mode_num);
            my %live  = _liveInputMetadata($client, $label, $mode_num);
            $playerState{$id}{is_external}   = 1;
            $playerState{$id}{external_hits} = $EXTERNAL_CONFIRM_POLLS;
            $playerState{$id}{mode}          = $mode_num;
            $playerState{$id}{mode_name}     = $label;
            $playerState{$id}{play_state}    = 'play';
            $playerState{$id}{time}          = 0;
            $playerState{$id}{duration}      = 0;
            $playerState{$id}{remoteMeta}    = {
                title      => $live{title},
                artist     => $live{artist},
                album      => $live{album},
                mode       => $live{mode} || $label,
                live_input => 1,
                type       => 'wiim',
            };
            _scheduleStatusRefresh($client, 0.05);
        }
    }
    $log->info("Switching " . $client->name() . " source to $src");

    apiCall($client, "setPlayerCmd:switchmode:$src", sub {
        $client->showBriefly({ line => ["Source: $src"] });
        _ensureMonitor($client);
        Slim::Utils::Timers::setTimer($client, time() + 0.5, sub {
            my $c = shift || return;
            apiCall($c, 'getPlayerStatus', sub {
                _applyPlayerStatus($c, shift);
                _scheduleStatusRefresh($c, 0.1);
            });
        }, $client);
    });
}

sub _showPresetMenu {
    my $client = shift;
    apiCall($client, 'getPresetInfo', sub {
        my $data = shift || {};
        my @presets = @{ $data->{preset_list} || [] };

        unless (@presets) {
            $client->showBriefly({ line => ['No WiiM presets found'] });
            Slim::Buttons::Common::popMode($client);
            $client->modeParam('wiim_submenu', undef);
            return;
        }

        my @items = map {
            {
                name  => $_->{name} || "Preset $_->{number}",
                value => $_->{number},
            }
        } @presets;

        Slim::Buttons::Common::pushMode($client, 'INPUT.Choice', {
            header   => '{SELECT_PRESET}',
            listRef  => \@items,
            onPlay   => \&_presetSelected,
            modeName => 'Wiim Integration Preset',
        });
    });
}

sub _presetSelected {
    my ($client, $item) = @_;
    return unless $item && defined $item->{value};
    playPreset($client, $item->{value});
    Slim::Buttons::Common::popMode($client);
    $client->modeParam('wiim_submenu', undef);
}

sub playPreset {
    my ($client, $num) = @_;
    return unless $client;
    $num =~ s/\D//g if defined $num;
    $num ||= 1;
    my $key = _presetKey($client, $num);
    my $label = ($key && $key->{name}) ? $key->{name} : "Preset $num";

    # Remote (Spotify, TIDAL, routine, custom URL): press the hardware key.
    # Do not switch the WiiM back to wifi — that would drop the native stream.
    if ($key && $key->{kind} eq 'remote') {
        $log->info('Remote WiiM preset ' . $num . ' (' . ($key->{source} || '?') . ') via MCUKeyShortClick on ' . ($client->name() || ''));
        apiCall($client, "MCUKeyShortClick:$num");
        $client->showBriefly({ line => [string('SELECT_PRESET'), $label] });
        return;
    }
    # Local bridge: play the Lyrion slot named by the URL. Button 6 can be slot 1.
    if ($key && $key->{kind} eq 'local' && $key->{lms_slot}) {
        my $slot = $key->{lms_slot};
        my ($shuffle, $repeat) = _presetSlotPlayModes($client, $slot);
        $log->info("Local WiiM button $num plays Lyrion slot $slot");
        _startLmsPresetFromWiim($client, $slot, $shuffle, $repeat);
        $client->showBriefly({ line => [string('SELECT_PRESET'), $label] });
        return;
    }
    if ($key && $key->{kind} eq 'empty') {
        my $slot = _lyrionPresetSlot($client, $num);
        return unless $slot->{has};
        my ($shuffle, $repeat) = _presetSlotPlayModes($client, $num);
        _startLmsPresetFromWiim($client, $num, $shuffle, $repeat);
        $client->showBriefly({ line => [string('SELECT_PRESET'), $label] });
        return;
    }
    return if $key;
    # Map not read yet. The hardware key itself is the safe default:
    # Spotify and HTTP bridges both start. A jsonrpc bridge waits until
    # the map is known and the direct Lyrion path above is used.
    $log->info("WiiM preset $num has no key map yet; MCUKeyShortClick");
    _ensurePresetKeys($client, 1);
    apiCall($client, "MCUKeyShortClick:$num");
    $client->showBriefly({ line => [string('SELECT_PRESET'), "Preset $num"] });
}

sub _presetKey {
    my ($client, $num) = @_;
    return unless $client && $num;
    my $id = $client->id() || return;
    my $keys = $playerState{$id}{preset_keys};
    return $keys->{$num} if $keys && $keys->{$num};
    my $list = $playerState{$id}{presets} || [];
    for my $p (@$list) {
        next unless ref $p eq 'HASH';
        my $n = $p->{number} || $p->{preset_num} || 0;
        next unless $n == $num;
        my $info = Plugins::WiimIntegration::PresetKeys::classify_fields(
            name    => $p->{name},
            url     => $p->{url} || $p->{URL} || '',
            source  => $p->{source} || '',
            pic     => $p->{picurl} || $p->{pic} || '',
            routine => $p->{routine} || '',
        );
        $info->{number} = 0 + $n;
        return $info;
    }
    return;
}

sub _lyrionPresetSlot {
    my ($client, $num) = @_;
    my $empty = { url => '', text => '', has => 0 };
    return $empty unless $client && $num;
    $num = int($num);
    return $empty if $num < 1 || $num > Plugins::WiimIntegration::PresetKeys::editor_slots();
    my $presets = eval { preferences('server')->client($client)->get('presets') } || [];
    my $p = $presets->[$num - 1] || {};
    my $url = $p->{URL} // $p->{url} // '';
    my $text = $p->{text} // '';
    return {
        url  => $url,
        text => $text,
        has  => (length($url) || length($text)) ? 1 : 0,
    };
}

# Copy a remote stream into an empty Lyrion slot. Does not touch other slots.
sub _storeLyrionSlotStream {
    my ($client, $num, $url, $text) = @_;
    return unless $client && $num && defined $url && $url ne '';
    my $cprefs = preferences('server')->client($client);
    my $presets = $cprefs->get('presets') || [];
    my @copy;
    for my $i (0 .. 9) {
        my $p = $presets->[$i];
        $copy[$i] = (ref $p eq 'HASH') ? { %$p } : { URL => '', text => '', type => 'audio' };
        $copy[$i]{URL}  //= '';
        $copy[$i]{text} //= '';
        $copy[$i]{type} //= 'audio';
    }
    my $prev = $copy[$num - 1] || {};
    $copy[$num - 1] = {
        URL     => $url,
        text    => defined $text ? $text : '',
        type    => 'audio',
        shuffle => 0 + ($prev->{shuffle} || 0),
        repeat  => 0 + ($prev->{repeat} || 0),
    };
    $cprefs->set('presets', \@copy);
}

# True when this key already shows a clean /preset/N link the WiiM app can
# display. A name-only update leaves Url set but drops the radio fields, and
# the app then shows the title with no link.
sub _localKeyLinkReady {
    my ($xml, $num, $url) = @_;
    return 0 unless $xml && $num && $url;
    return 0 unless $xml =~ m{<Key$num>(.*?)</Key$num>}s;
    my $body = $1;
    return 0 unless $body =~ m{<ContentType>radio</ContentType>};
    my ($got) = $body =~ m{<Url>(.*?)</Url>}s;
    $got = Plugins::WiimIntegration::PresetKeys::xml_text($got // '');
    return $got eq $url ? 1 : 0;
}

# Refresh one local button: the visible name follows the Lyrion slot its URL
# plays, and the link is rewritten to the clean /preset/N for that same slot.
# Hardware key 6 that plays slot 1 stays on slot 1. Remote buttons are not
# passed here.
sub _localKeyRefresh {
    my ($client, $num, $key, $xml) = @_;
    return unless $key && ($key->{kind} || '') eq 'local';
    my $slot_n = $key->{lms_slot} || $num;
    return if $slot_n < 1 || $slot_n > Plugins::WiimIntegration::PresetKeys::editor_slots();
    my $slot = _lyrionPresetSlot($client, $slot_n);
    my $title = Plugins::WiimIntegration::PresetKeys::clean_name($slot->{text} || '');
    return if $title eq '';
    my $url = _httpBaseUrl() . '/preset/' . $slot_n;
    my $name_ok = $title eq Plugins::WiimIntegration::PresetKeys::clean_name($key->{name} || '');
    return if $name_ok && _localKeyLinkReady($xml, $num, $url);
    return { num => $num, title => $title, url => $url };
}

# Called after the presets editor saves. Fills empty buttons, and rewrites a
# local bridge when its title or its link is stale. Remote buttons stay.
sub syncEmptyPresetKeys {
    my $client = shift;
    $client = shift unless ref $client;
    return unless $client && isWiimPlayer($client);
    _writePresetBridges($client, 'empty', 0, undef);
}

sub _ensurePresetKeys {
    my ($client, $allow_autofill) = @_;
    return unless $client && isWiimPlayer($client);
    my $id = $client->id() || return;
    return if $playerState{$id}{preset_keys_busy};
    my $at = $playerState{$id}{preset_keys_at} || 0;
    if ($at && (time() - $at) < 20 && $playerState{$id}{preset_keys}) {
        if ($allow_autofill && !$playerState{$id}{preset_autofill_done}) {
            $playerState{$id}{preset_autofill_done} = 1;
            _writePresetBridges($client, 'empty', 0, undef);
        }
        return;
    }
    _refreshPresetKeys($client, $allow_autofill);
}

sub _refreshPresetKeys {
    my ($client, $allow_autofill) = @_;
    return unless $client && isWiimPlayer($client);
    my $id = $client->id() || return;
    return if $playerState{$id}{preset_keys_busy};
    $playerState{$id}{preset_keys_busy} = 1;
    my $do_fill = ($allow_autofill && !$playerState{$id}{preset_autofill_done}) ? 1 : 0;
    $playerState{$id}{preset_autofill_done} = 1 if $do_fill;
    my $started = time();
    Plugins::WiimIntegration::UPnPHelper::getKeyMapping($client, sub {
        my $body = shift;
        delete $playerState{$id}{preset_keys_busy};
        my $xml = Plugins::WiimIntegration::PresetKeys::queue_context_from_soap($body || '');
        unless ($xml) {
            $playerState{$id}{preset_keys_at} = time();
            $playerState{$id}{preset_autofill_done} = 0 if $do_fill;
            unless ($playerState{$id}{preset_key_warn}) {
                $playerState{$id}{preset_key_warn} = time();
                $log->warn('GetKeyMapping failed for ' . ($client->name() || $id));
            }
            return;
        }
        delete $playerState{$id}{preset_key_warn};
        if (($playerState{$id}{preset_keys_at} || 0) > $started) {
            $log->info('Skip stale GetKeyMapping for ' . ($client->name() || $id));
            return;
        }
        $playerState{$id}{preset_keys} = Plugins::WiimIntegration::PresetKeys::parse_key_list($xml);
        $playerState{$id}{preset_key_xml} = $xml;
        $playerState{$id}{preset_keys_at} = time();
        _writePresetBridges($client, 'empty', 0, undef) if $do_fill;
    });
}

sub _writePresetBridges {
    my ($client, $mode, $num, $cb) = @_;
    unless ($client && isWiimPlayer($client)) {
        $cb && $cb->({ ok => 0, error => 'no_client' });
        return;
    }
    my $id = $client->id();
    unless ($id) {
        $cb && $cb->({ ok => 0, error => 'no_client' });
        return;
    }
    if ($playerState{$id}{preset_write_lock}) {
        push @{$playerState{$id}{preset_write_q}}, [ $mode, $num, $cb ];
        return;
    }
    $playerState{$id}{preset_write_lock} = 1;
    _writePresetBridgesNow($client, $mode, $num, sub {
        my $res = shift;
        delete $playerState{$id}{preset_write_lock};
        $cb && $cb->($res);
        my $q = $playerState{$id}{preset_write_q} || [];
        my $next = shift @$q;
        _writePresetBridges($client, @$next) if $next;
    });
}

sub _writePresetBridgesNow {
    my ($client, $mode, $num, $cb) = @_;
    my $id = $client->id() || do {
        $cb && $cb->({ ok => 0, error => 'no_client' });
        return;
    };
    $mode ||= 'empty';
    Plugins::WiimIntegration::UPnPHelper::getKeyMapping($client, sub {
        my $body = shift;
        my $xml = Plugins::WiimIntegration::PresetKeys::queue_context_from_soap($body || '');
        unless ($xml) {
            $log->warn('GetKeyMapping failed before preset write on ' . ($client->name() || $id));
            $cb && $cb->({ ok => 0, error => 'no_map' });
            return;
        }
        my $keys = Plugins::WiimIntegration::PresetKeys::parse_key_list($xml);
        my @jobs;
        my $copied = 0;
        if ($mode eq 'claim') {
            my $n = int($num || 0);
            if ($n < 1 || $n > Plugins::WiimIntegration::PresetKeys::editor_slots()) {
                $cb && $cb->({ ok => 0, error => 'bad_slot' });
                return;
            }
            my $key = $keys->{$n} || { kind => 'empty' };
            if (($key->{kind} || '') eq 'local') {
                my $rename = _localKeyRefresh($client, $n, $key, $xml);
                unless ($rename) {
                    $playerState{$id}{preset_keys} = $keys;
                    $playerState{$id}{preset_keys_at} = time();
                    $cb && $cb->({ ok => 1, skipped => 'local', lms_slot => $key->{lms_slot} || 0, written => 0 });
                    return;
                }
                push @jobs, $rename;
            }
            else {
                my $slot = _lyrionPresetSlot($client, $n);
                my $title;
                if ($slot->{has}) {
                    $title = $slot->{text} || "Preset $n";
                }
                elsif ($key->{copyable} && $key->{url}) {
                    $title = $key->{name} || "Preset $n";
                    _storeLyrionSlotStream($client, $n, $key->{url}, $title);
                    $copied = 1;
                }
                else {
                    $cb && $cb->({ ok => 0, error => 'nothing_to_claim' });
                    return;
                }
                push @jobs, { num => $n, title => $title };
            }
        }
        else {
            for my $n (1 .. Plugins::WiimIntegration::PresetKeys::editor_slots()) {
                my $key = $keys->{$n};
                my $kind = $key ? ($key->{kind} || 'empty') : 'empty';
                if ($kind eq 'empty') {
                    my $slot = _lyrionPresetSlot($client, $n);
                    if ($slot->{has}) {
                        push @jobs, { num => $n, title => ($slot->{text} || "Preset $n") };
                    }
                    next;
                }
                my $rename = _localKeyRefresh($client, $n, $key, $xml);
                push @jobs, $rename if $rename;
            }
        }
        unless (@jobs) {
            $playerState{$id}{preset_keys} = $keys;
            $playerState{$id}{preset_key_xml} = $xml;
            $playerState{$id}{preset_keys_at} = time();
            $cb && $cb->({ ok => 1, written => 0 });
            return;
        }
        my $base = _httpBaseUrl();
        my $out = $xml;
        for my $job (@jobs) {
            my $url = $job->{url} || ($base . '/preset/' . $job->{num});
            my $el = Plugins::WiimIntegration::PresetKeys::local_key_xml($job->{num}, $job->{title}, $url);
            $out = Plugins::WiimIntegration::PresetKeys::replace_key($out, $job->{num}, $el);
        }
        my $soap = Plugins::WiimIntegration::PresetKeys::soap_set_mapping($out);
        my $which = join(',', map { $_->{num} } @jobs);
        $log->info('SetKeyMapping preset bridge ' . $which . ' on ' . ($client->name() || $id)
            . ($copied ? ' (stream copied into the Lyrion slot)' : ''));
        Plugins::WiimIntegration::UPnPHelper::setKeyMapping($client, $soap, sub {
            my $ok = shift;
            if ($ok) {
                $playerState{$id}{preset_keys} = Plugins::WiimIntegration::PresetKeys::parse_key_list($out);
                $playerState{$id}{preset_key_xml} = $out;
                $playerState{$id}{preset_keys_at} = time();
            }
            else {
                $log->warn('SetKeyMapping failed on ' . ($client->name() || $id) . " keys $which");
            }
            $cb && $cb->({
                ok      => $ok ? 1 : 0,
                written => $ok ? scalar(@jobs) : 0,
                copied  => $copied,
                error   => $ok ? '' : 'write_failed',
            });
        });
    });
}

# HTTP endpoints for WiiM presets / shortcuts (matched by requesting IP → player).
# Clean paths (preferred):
#   /preset/1
#   /control/play  /control/pause  /control/stop  /control/next  /control/prev
#   /control/shuffle  /control/shuffle_on  /control/shuffle_off
#   /control/source/bluetooth  /control/source/line-in  …
# Legacy (still accepted):
#   /preset=1.m3u
sub _dlnaSourceHash {
    my $client = shift || return;
    return unless isWiimPlayer($client);
    my $id = $client->id() || return;
    my $st = $playerState{$id} || {};
    my $meta = $st->{remoteMeta} || {};
    return {
        id         => lc($id),
        play_state => $st->{play_state} || '',
        time       => $st->{time} || 0,
        duration   => $st->{duration} || 0,
        title      => $meta->{title} || '',
        artist     => $meta->{artist} || '',
        album      => $meta->{album} || '',
        cover      => _cleanCover($meta->{cover} || $meta->{arturl} || ''),
    };
}

sub _dlnaSourceForIp {
    my $ip = shift || '';
    my $client = _findClientForWiimIp($ip);
    if (!$client) {
        my @ext = grep {
            my $st = $playerState{$_->id()} || {};
            $st->{is_external} && (($st->{play_state} || '') =~ /^(?:play|pause)/);
        } _allWiimClients();
        $client = $ext[0] if @ext == 1;
    }
    return _dlnaSourceHash($client);
}

sub _dlnaSourceForClient {
    return _dlnaSourceHash(shift);
}

sub _dlnaTargets {
    my $source_id = lc(shift || '');
    my $cur = $prefs->get('dlna_targets') || [];
    $cur = [] unless ref $cur eq 'ARRAY';
    my @out;
    foreach my $id (@$cur) {
        next unless $id;
        next if $source_id && lc($id) eq $source_id;
        my $client = Slim::Player::Client->getClient($id)
            || Slim::Player::Client->getClient(lc $id);
        next unless $client && !$client->disconnected();
        next if _dlnaIsOwnRenderer($client);
        push @out, $client;
    }
    return @out;
}

sub _dlnaTargetOn {
    my $id = lc(shift || '');
    return 0 unless $id;
    my $cur = $prefs->get('dlna_targets') || [];
    $cur = [] unless ref $cur eq 'ARRAY';
    return (grep { lc($_) eq $id } @$cur) ? 1 : 0;
}

sub _dlnaSetTarget {
    my ($id, $on) = @_;
    $id = lc($id || '');
    return unless $id;
    my $cur = $prefs->get('dlna_targets') || [];
    $cur = [] unless ref $cur eq 'ARRAY';
    my %set = map { lc($_) => 1 } grep { defined $_ && $_ ne '' } @$cur;
    if ($on) {
        $set{$id} = 1;
    }
    else {
        delete $set{$id};
    }
    $prefs->set('dlna_targets', [sort keys %set]);
}

# UPnPBridge reimports this renderer as a squeezelite player of the same name.
# Playing back onto that player would loop the cast into itself.
sub _dlnaIsOwnRenderer {
    my $client = shift || return 0;
    my $name = eval { $client->name() } || '';
    return 0 if $name eq '';
    my $st = eval { Plugins::WiimIntegration::DlnaRenderer::status() } || {};
    return $name eq ($st->{name} || '');
}

sub _dlnaCandidates {
    my $with_groups = shift;
    my (@players, @groups);
    foreach my $client (Slim::Player::Client::clients()) {
        next if !$client || $client->disconnected();
        next if isWiimPlayer($client);
        next if _dlnaIsOwnRenderer($client);
        my $model = eval { $client->model() } || '';
        if ($model eq 'group') {
            push @groups, $client if $with_groups;
            next;
        }
        push @players, $client;
    }
    my $by_name = sub { lc($a->name() || '') cmp lc($b->name() || '') };
    @players = sort $by_name @players;
    return @players unless $with_groups;
    @groups = sort $by_name @groups;
    return (@players, @groups);
}

sub _dlnaCurrentUrl {
    my $client = shift || return '';
    my $song = eval { $client->playingSong() || $client->streamingSong() } || return '';
    my $track = eval { $song->currentTrack() } || return '';
    return eval { $track->url() } || '';
}

sub _dlnaPublishMeta {
    my ($url, $meta) = @_;
    return unless $url && $meta && ref $meta eq 'HASH';
    eval {
        require Slim::Music::Info;
        Slim::Music::Info::setRemoteMetadata($url, {
            title  => $meta->{title}  || '',
            artist => $meta->{artist} || '',
            album  => $meta->{album}  || '',
            cover  => $meta->{cover}  || '',
            icon   => $meta->{cover}  || '',
        });
        Slim::Music::Info::setCurrentTitle($url, $meta->{title}) if $meta->{title};
        1;
    };
}

# The cast URL replaces the target's queue. Artwork is the WiiM cover we already have.
sub _dlnaIsRelayUrl {
    my $url = shift || return 0;
    return 1 if $url =~ m{^wiimrelay://}i;
    return $url =~ m{/plugins/WiimIntegration/relay\.} ? 1 : 0;
}

sub _dlnaPlayOn {
    my ($client, $url, $meta) = @_;
    return unless $client && $url;
    $meta ||= {};
    # VLC plays the WiiM URL. LMS must not open it: the chunked header is a lie,
    # and opening our own relay waits on this process. The player fetches the relay.
    my $wiim_id = '';
    if ($url =~ m{^wiimrelay://([0-9a-f:]+)}i) {
        $wiim_id = lc $1;
    }
    elsif ($url =~ m{^https?://([^/:]+)}i) {
        my $host = $1;
        $host =~ s/:\d+$//;
        for my $wiim (_allWiimClients()) {
            my $ip = eval { $wiim->ip() } || '';
            $ip =~ s/:\d+$//;
            next unless $ip && lc($ip) eq lc($host);
            $wiim_id = lc($wiim->id() || '');
            last;
        }
    }
    if ($wiim_id) {
        $url = 'wiimrelay://' . $wiim_id;
        my $src = _wiimClientById($wiim_id);
        _diffuseRememberSource($src) if $src;
    }
    my $title = $meta->{title} || 'WiiM';
    _dlnaPublishMeta($url, $meta);
    if ($wiim_id) {
        my $audio = _lmsListenBaseUrl() . '/plugins/WiimIntegration/relay.mp3?wiim='
            . uri_escape_utf8($wiim_id);
        _dlnaPublishMeta($audio, $meta);
    }
    my $id = $client->id() || '';
    if (_dlnaCurrentUrl($client) eq $url && $client->power() && $client->isPlaying() && !$client->isPaused()) {
        return;
    }
    $playerState{$id}{suppress_playlist_hook} = 1 if $id;
    my $go = sub {
        $log->info('DLNA redistribute to ' . ($client->name() || $id) . " ($title)");
        Slim::Control::Request::executeRequest($client, ['playlist', 'play', $url, $title]);
        Slim::Utils::Timers::setTimer($client, time() + 2, sub {
            delete $playerState{$id}{suppress_playlist_hook} if $id;
        });
    };
    if (!$client->power()) {
        Slim::Control::Request::executeRequest($client, ['power', 1, 1]);
        Slim::Utils::Timers::setTimer($client, time() + 0.4, $go);
    }
    else {
        $go->();
    }
}

sub _dlnaTransportOn {
    my ($client, $how, $url) = @_;
    return unless $client && $how;
    my $current = _dlnaCurrentUrl($client);
    return if $url && $current && $current ne $url && !_dlnaIsRelayUrl($current);
    if ($how eq 'pause') {
        Slim::Control::Request::executeRequest($client, ['pause', 1]) unless $client->isPaused();
    }
    elsif ($how eq 'stop') {
        Slim::Control::Request::executeRequest($client, ['stop']) if $current;
    }
    elsif ($how eq 'play' && $current && (!$url || $current eq $url || _dlnaIsRelayUrl($current)) && $client->isPaused()) {
        Slim::Control::Request::executeRequest($client, ['pause', 0]);
    }
}

sub _dlnaRefreshOn {
    my ($client, $url, $meta) = @_;
    my $current = _dlnaCurrentUrl($client);
    return unless $client && $url && $current && ($current eq $url || _dlnaIsRelayUrl($current));
    _dlnaPublishMeta($url, $meta);
    _dlnaPublishMeta($current, $meta) if _dlnaIsRelayUrl($current);
    Slim::Control::Request::notifyFromArray($client, ['playlist', 'newsong']);
}

my %relay;

# The WiiM says "chunked" and then sends raw ICY audio. VLC ignores the
# header. LMS stops. This relay answers at once and reads upstream on the
# LMS select loop, so the request never blocks the server.
sub _serveRelay {
    my ($httpClient, $response) = @_;
    my $path = eval { $response->request->uri->path } || '';
    my $query = eval { $response->request->uri->query } || '';
    my ($wiim_id) = $query =~ /(?:^|&)wiim=([^&]+)/;
    $wiim_id = Slim::Utils::Misc::unescape($wiim_id, 1) if $wiim_id;
    my $wiim = _wiimClientById($wiim_id || '');
    my $direct = $wiim ? _directStreamUrl($wiim) : '';
    return _relayText($httpClient, $response, 404, 'no stream') unless $direct;

    my $up_url = _upstreamForLms($direct);
    my $ext = ($up_url =~ /\.mp3(?:\?|$)/i) ? 'mp3' : 'flac';
    if ($path =~ /\.m3u$/i) {
        my $st = eval { Plugins::WiimIntegration::DlnaRenderer::status() } || {};
        my $title = $st->{title} || ($wiim->name() || 'WiiM');
        $title =~ s/[\r\n,]+/ /g;
        my $audio = _lmsListenBaseUrl() . '/plugins/WiimIntegration/relay.' . $ext
            . '?wiim=' . uri_escape_utf8(lc($wiim->id() || ''));
        my $body = "#EXTM3U\n#EXTINF:-1,$title\n$audio\n";
        utf8::encode($body) if utf8::is_utf8($body);
        return _relayText($httpClient, $response, 200, $body, 'audio/x-mpegurl');
    }

    my ($scheme, $host, $port, $up_path) = $up_url =~ m{^(https?)://([^/:]+)(?::(\d+))?(/.*)?$}i;
    $port ||= 80;
    $up_path ||= '/';
    unless ($scheme && $scheme =~ /^http$/i && $host =~ /^\d+\.\d+\.\d+\.\d+$/) {
        return _relayText($httpClient, $response, 502, 'unsupported stream');
    }
    my $up = _relayConnect($host, $port);
    return _relayText($httpClient, $response, 502, "upstream $!") unless $up;

    my $st = {
        http     => $httpClient,
        response => $response,
        phase    => 'connect',
        raw      => '',
        headers  => 1,
        req      => "GET $up_path HTTP/1.0\r\nHost: $host:$port\r\nConnection: close\r\n\r\n",
        metaint  => 0,
        audio_left => 0,
        meta_left  => 0,
    };
    $relay{$up} = $st;
    $log->info("DLNA relay $host:$port$up_path");
    Slim::Networking::Select::addWrite($up, \&_relayWritable);
    Slim::Utils::Timers::setTimer($up, time() + 4, \&_relayTimeout);
}

sub _relayText {
    my ($http, $response, $code, $msg, $type) = @_;
    $type ||= 'text/plain';
    $response->code($code);
    $response->content_type($type);
    $response->header('Connection' => 'close');
    $response->header('Cache-Control' => 'no-cache');
    $response->remove_header('Transfer-Encoding') if $response->can('remove_header');
    $response->header('Content-Length' => length($msg));
    Slim::Web::HTTP::addHTTPResponse($http, $response, \$msg);
}

sub _relayConnect {
    my ($host, $port) = @_;
    my $ip = inet_aton($host) or return;
    socket(my $sock, PF_INET, SOCK_STREAM, scalar getprotobyname('tcp')) or return;
    binmode($sock);
    my $flags = fcntl($sock, F_GETFL, 0);
    fcntl($sock, F_SETFL, ($flags || 0) | O_NONBLOCK);
    my $ok = connect($sock, pack_sockaddr_in($port, $ip));
    if (!$ok && !($!{EINPROGRESS} || $!{EWOULDBLOCK} || $!{EAGAIN})) {
        my $err = $!;
        close $sock;
        $! = $err;
        return;
    }
    return $sock;
}

sub _relayWritable {
    my $up = shift || return;
    my $st = $relay{$up} || return;
    if ($st->{phase} eq 'connect') {
        my $packed = getsockopt($up, SOL_SOCKET, SO_ERROR);
        my $err = $packed ? unpack('I', $packed) : 0;
        if ($err) {
            _relayAbort($up, 502, "upstream connect $err");
            return;
        }
        $st->{phase} = 'send';
    }
    return unless $st->{phase} eq 'send';
    my $n = syswrite($up, $st->{req});
    if (!defined $n) {
        return if $!{EAGAIN} || $!{EWOULDBLOCK} || $!{EINTR};
        _relayAbort($up, 502, "upstream write $!");
        return;
    }
    substr($st->{req}, 0, $n, '') if $n;
    return if $st->{req} ne '';
    $st->{phase} = 'hdr';
    Slim::Networking::Select::removeWrite($up);
    Slim::Networking::Select::addRead($up, \&_relayRead);
}

sub _relayTimeout {
    my $up = shift || return;
    my $st = $relay{$up} || return;
    return if $st->{phase} && $st->{phase} eq 'body';
    _relayAbort($up, 502, 'upstream timeout');
}

sub _relaySend {
    my ($st, $audio, $more) = @_;
    $more = 1 unless defined $more;
    $audio = '' unless defined $audio;
    return if $audio eq '' && !$st->{headers} && $more;
    my $http = $st->{http};
    if (!$http || !$http->connected()) {
        return;
    }
    my $send_headers = $st->{headers} ? 1 : 0;
    $st->{headers} = 0;
    Slim::Web::HTTP::addHTTPResponse($http, $st->{response}, \$audio, $send_headers, $more ? 1 : 0);
}

sub _relayOpen {
    my ($st, $hdr, $rest) = @_;
    my ($code) = ($hdr || '') =~ m{^HTTP/\S+\s+(\d+)};
    $code ||= 0;
    if ($code < 200 || $code >= 300) {
        return 0;
    }
    my ($metaint) = $hdr =~ /icy-metaint:\s*(\d+)/i;
    my ($ctype) = $hdr =~ /Content-Type:\s*([^\r\n;]+)/i;
    $ctype ||= 'audio/mpeg';
    $ctype = 'audio/flac' if $ctype =~ /flac/i;
    $ctype = 'audio/mpeg' if $ctype =~ /mpeg|mp3/i;
    my $response = $st->{response};
    $response->code(200);
    $response->content_type($ctype);
    $response->header('Connection' => 'close');
    $response->header('Cache-Control' => 'no-cache');
    $response->remove_header('Content-Length') if $response->can('remove_header');
    $response->remove_header('Transfer-Encoding') if $response->can('remove_header');
    $st->{metaint} = ($metaint || 0) + 0;
    $st->{audio_left} = $st->{metaint};
    $st->{meta_left} = 0;
    $st->{phase} = 'body';
    my $audio = _relayStrip($st, $rest || '');
    _relaySend($st, $audio, 1);
    return 1;
}

sub _relayStrip {
    my ($st, $data) = @_;
    return '' unless defined $data && $data ne '';
    my $meta = $st->{metaint} || 0;
    return $data unless $meta;
    my $out = '';
    my $i = 0;
    my $len = length($data);
    while ($i < $len) {
        if ($st->{meta_left}) {
            my $take = $st->{meta_left};
            $take = $len - $i if $take > $len - $i;
            $i += $take;
            $st->{meta_left} -= $take;
            next;
        }
        if (($st->{audio_left} || 0) <= 0) {
            $st->{meta_left} = ord(substr($data, $i, 1)) * 16;
            $st->{audio_left} = $meta;
            $i++;
            next;
        }
        my $take = $st->{audio_left};
        $take = $len - $i if $take > $len - $i;
        $out .= substr($data, $i, $take);
        $i += $take;
        $st->{audio_left} -= $take;
    }
    return $out;
}

sub _relayRead {
    my $up = shift || return;
    my $st = $relay{$up} || return;
    my $http = $st->{http};
    if (!$http || !$http->connected()) {
        _relayClose($up);
        return;
    }
    my $n = sysread($up, my $buf, 8192);
    if (!defined $n) {
        return if $!{EAGAIN} || $!{EWOULDBLOCK} || $!{EINTR};
        _relayClose($up);
        return;
    }
    if (!$n) {
        _relayClose($up);
        return;
    }
    if ($st->{phase} eq 'hdr') {
        $st->{raw} .= $buf;
        return if $st->{raw} !~ /\r\n\r\n/ && length($st->{raw}) < 16384;
        my ($hdr, $rest) = split(/\r\n\r\n/, $st->{raw}, 2);
        $st->{raw} = '';
        Slim::Utils::Timers::killTimers($up, \&_relayTimeout);
        unless (_relayOpen($st, $hdr, $rest)) {
            _relayAbort($up, 502, 'upstream rejected');
        }
        return;
    }
    my $audio = _relayStrip($st, $buf);
    _relaySend($st, $audio, 1) if $audio ne '';
}

sub _relayAbort {
    my ($up, $code, $msg) = @_;
    my $st = delete $relay{$up} || return;
    Slim::Utils::Timers::killTimers($up, \&_relayTimeout);
    eval { Slim::Networking::Select::removeRead($up) };
    eval { Slim::Networking::Select::removeWrite($up) };
    eval { close $up };
    if ($st->{headers} && $st->{http}) {
        _relayText($st->{http}, $st->{response}, $code || 502, $msg || 'upstream');
    }
    $log->info('DLNA relay closed: ' . ($msg || ''));
}

sub _relayClose {
    my $up = shift || return;
    my $st = delete $relay{$up} || return;
    Slim::Utils::Timers::killTimers($up, \&_relayTimeout);
    eval { Slim::Networking::Select::removeRead($up) };
    eval { Slim::Networking::Select::removeWrite($up) };
    eval { close $up };
    return unless $st && $st->{http};
    if ($st->{headers}) {
        _relayText($st->{http}, $st->{response}, 502, 'upstream closed');
    }
    else {
        _relaySend($st, '', 0);
    }
}

sub _registerHttpEndpoints {
    return unless main::WEBUI;

    Plugins::WiimIntegration::DlnaRenderer::register_http();

    Slim::Web::Pages->addRawFunction(
        qr{^/plugins/WiimIntegration/relay\.(?:m3u|flac|mp3)$},
        \&_serveRelay
    );

    # Preset bridge — clean + legacy
    Slim::Web::Pages->addRawFunction(qr{^/preset/(\d+)(?:\.m3u)?$}, \&servePreset);
    Slim::Web::Pages->addRawFunction(qr{^/preset=(\d+)\.m3u$},     \&servePreset);

    # Simple transport / shuffle / source controls
    Slim::Web::Pages->addRawFunction(
        qr{^/(?:control|playback)/(play|pause|stop|next|prev|toggle|shuffle|shuffle_on|shuffle_off|repeat|repeat_off|repeat_one|repeat_all)(?:\.m3u)?$}i,
        \&serveControl
    );
    Slim::Web::Pages->addRawFunction(
        qr{^/(?:control|playback)/source/(bluetooth|line-in|optical|hdmi|tv|wifi)(?:\.m3u)?$}i,
        \&serveControl
    );
}

sub _lmsListenBaseUrl {
    my $port = eval { preferences('server')->get('httpport') } || 9000;
    my $ip   = Slim::Utils::Network::hostAddr() || '127.0.0.1';
    return "http://$ip:$port";
}

# GET jsonrpc.js?request=<urlencoded slim.request> — works from WiiM Home
# shortcuts without our /preset/N M3U (and without matching by source IP).
sub _lmsJsonRpcUrl {
    my ($player_id, $cmd) = @_;
    return '' unless $player_id && $cmd && ref $cmd eq 'ARRAY';
    my $payload = encode_json({
        id     => 0,
        method => 'slim.request',
        params => [ $player_id, $cmd ],
    });
    return _lmsListenBaseUrl() . '/jsonrpc.js?request=' . uri_escape_utf8($payload);
}

sub _httpBaseUrl {
    # The WiiM fetches this URL itself from the remote and the Home app.
    # It reaches the LAN address: Sous-sol button 5 is
    # http://192.168.1.4:9000/status.html, and the last device GETs that
    # actually ran a preset were http://192.168.1.4:9000/preset=N.m3u.
    # hostname.local does not. After the keys moved to Audio.local,
    # servePreset was never called again.
    return _lmsListenBaseUrl();
}

sub _clientFromHttpRequest {
    my ($httpClient) = @_;
    my $remote_ip = eval { $httpClient->peerhost() } || '';
    return (_findClientForWiimIp($remote_ip), $remote_ip);
}

sub _silenceM3U {
    my ($title) = @_;
    $title //= 'LMS';
    my $base = _httpBaseUrl();
    # empty.mp3 is always relative to the real LMS host (IP), not mDNS name
    my $port = eval { preferences('server')->get('httpport') } || 9000;
    my $ip   = Slim::Utils::Network::hostAddr() || '127.0.0.1';
    return "#EXTM3U\n#EXTINF:-1,$title\nhttp://$ip:$port/empty.mp3\n";
}

sub servePreset {
    my ($httpClient, $response) = @_;
    my $uri  = eval { $response->request->uri } || return;
    my $path = $uri->path || '';
    my ($preset) = $path =~ m{^/preset[=/](\d+)(?:\.m3u)?$}i;
    $preset ||= 1;

    my ($client, $remote_ip) = _clientFromHttpRequest($httpClient);
    $remote_ip ||= 'unknown';
    # Optional ?player=MAC — same targeting as jsonrpc.js params[0]
    my $qs = eval { $uri->query } || '';
    if ($qs =~ /(?:^|&)player=([^&]+)/i) {
        my $id = eval { Slim::Utils::Misc::unescape($1, 1) } || $1;
        $id =~ s/%3A/:/gi;
        my $by_id = Slim::Player::Client->getClient($id)
            || Slim::Player::Client->getClient(lc($id));
        $client = $by_id if $by_id;
    }
    return _serveError($httpClient, $response, "No mapping for this WiiM ($remote_ip)") unless $client;

    my $target_mac = $client->id() || '';
    my $cmd = [ 'button', "preset_${preset}.single" ];
    # Editor slot is the source of truth. WiiM Home should use a clean /preset/N
    # URL — shuffle/repeat are not required (or wanted) as query params.
    my ($shuffle, $repeat) = _presetSlotPlayModes($client, $preset);
    my $qs_sh = _qsPlayMode($qs, 'shuffle');
    my $qs_rp = _qsPlayMode($qs, 'repeat');
    $shuffle = $qs_sh if defined $qs_sh;
    $repeat  = $qs_rp if defined $qs_rp;
    my $debounce_key = "preset:$remote_ip:$preset:" . lc($target_mac);
    my $now = time();

    unless ($lastPresetTrigger{$debounce_key} && ($now - $lastPresetTrigger{$debounce_key}) < 5) {
        $lastPresetTrigger{$debounce_key} = $now;
        # jsonrpc equivalent: button preset_N.single + this slot's shuffle/repeat.
        _startLmsPresetFromWiim($client, $preset, $shuffle, $repeat, 1);
    }
    else {
        $log->info("Preset $preset debounced for WiiM $remote_ip");
    }

    $log->info("Preset $preset from $remote_ip -> $target_mac ($path) as button preset_${preset}.single"
        . " shuffle=$shuffle repeat=$repeat");

    my @commands = ( $cmd );
    push @commands, [ 'playlist', 'shuffle', '' . $shuffle ] if defined $shuffle;
    push @commands, [ 'playlist', 'repeat',  '' . $repeat  ] if defined $repeat;
    my $result = { ok => 1, preset => 0 + $preset, player => $target_mac };
    $result->{shuffle} = 0 + $shuffle if defined $shuffle;
    $result->{repeat}  = 0 + $repeat  if defined $repeat;

    # Same body as jsonrpc.js. A WAV or silence M3U makes the WiiM play
    # this GET as a radio stream, then the plugin has to pull it back.
    _sendJson($httpClient, $response, {
        id       => 0,
        method   => 'slim.request',
        params   => [ $target_mac, $cmd ],
        commands => [ map { [ $target_mac, $_ ] } @commands ],
        result   => $result,
    });
}

sub _qsPlayMode {
    my ($qs, $name) = @_;
    return unless defined $qs && $name;
    return unless $qs =~ /(?:^|&)\Q$name\E=([012])(?:&|$)/;
    return 0 + $1;
}

sub _presetSlotPlayModes {
    my ($client, $num) = @_;
    return (0, 0) unless $client && $num;
    my $presets = eval { preferences('server')->client($client)->get('presets') } || [];
    my $p = $presets->[$num - 1] || {};
    my $shuffle = 0 + ($p->{shuffle} // 0);
    my $repeat  = 0 + ($p->{repeat}  // 0);
    $shuffle = 0 if $shuffle !~ /^[012]$/;
    $repeat  = 0 if $repeat  !~ /^[012]$/;
    return ($shuffle, $repeat);
}

sub serveControl {
    my ($httpClient, $response) = @_;
    my $path = eval { $response->request->uri->path } || '';
    my $want_m3u = ($path =~ /\.m3u$/i) ? 1 : 0;
    $path =~ s/\.m3u$//i;

    my ($client, $remote_ip) = _clientFromHttpRequest($httpClient);
    $remote_ip ||= 'unknown';
    return _serveError($httpClient, $response, "No mapping for this WiiM ($remote_ip)") unless $client;

    my $debounce_key = "ctrl:$remote_ip:$path";
    my $now = time();
    if ($lastPresetTrigger{$debounce_key} && ($now - $lastPresetTrigger{$debounce_key}) < 1.5) {
        my $qs = eval { $response->request->uri->query } || '';
        _replyWebhook($httpClient, $response, $want_m3u, $qs, { id => 0, result => { ok => 1, debounced => 1 } });
        return;
    }
    $lastPresetTrigger{$debounce_key} = $now;

    my $label = 'LMS Control';
    my $rpc;
    if ($path =~ m{^/(?:control|playback)/source/([a-z0-9-]+)$}i) {
        my $src = lc($1);
        $src = 'hdmi' if $src eq 'tv';
        if (_validSource($client, $src)) {
            switchSource($client, $src);
            $label = "Source $src";
        }
        else {
            return _serveError($httpClient, $response, "Unknown source: $src");
        }
    }
    elsif ($path =~ m{^/(?:control|playback)/(play|pause|stop|next|prev|toggle|shuffle|shuffle_on|shuffle_off|repeat|repeat_off|repeat_one|repeat_all)$}i) {
        my $cmd = lc($1);
        ($label, $rpc) = _runHttpControl($client, $cmd);
        $label ||= "Control $cmd";
    }
    else {
        return _serveError($httpClient, $response, "Unknown control path: $path");
    }

    $log->info("Control $path from $remote_ip -> " . ($client->name() || $client->id()));
    my $qs = eval { $response->request->uri->query } || '';
    _replyWebhook($httpClient, $response, $want_m3u, $qs, {
        id     => 0,
        method => 'slim.request',
        params => [ $client->id(), $rpc || ['pause'] ],
        result => { ok => 1, control => $label, player => $client->id() },
    });
}

# WiiM Home re-GETs shortcut URLs as the "stream" ends (~2–7s). LMS `pause`
# without an arg is a toggle, so the second GET resumes playback. Hold the
# first click's pause/play until the refetches go quiet.
my $HTTP_TOGGLE_STICKY = 20;

sub _holdHttpPaused {
    my ($client) = @_;
    return unless $client;
    my $id = $client->id() || return;
    $playerState{$id}{user_http_paused} = 1;
    Slim::Utils::Timers::killTimers($client, \&_maybeStartLmsPlayback);
    Slim::Utils::Timers::killTimers($client, \&_playLmsQueueFromStart);
    Slim::Utils::Timers::killTimers($client, \&_returnWiimToWifiAfterWebhook);
    delete $playerState{$id}{pending_lms_play};
}

sub _clearHttpPaused {
    my ($client) = @_;
    return unless $client;
    my $id = $client->id() || return;
    delete $playerState{$id}{user_http_paused};
    delete $playerState{$id}{http_toggle_intent};
    delete $playerState{$id}{http_toggle_at};
}

sub _applyHttpPlayIntent {
    my ($client, $intent, $is_retry) = @_;
    $intent = ($intent || '') eq 'play' ? 'play' : 'pause';
    if ($intent eq 'pause') {
        _holdHttpPaused($client);
        eval { Slim::Control::Request::executeRequest($client, ['pause', '1']) };
        return (($is_retry ? 'Toggle Pause (hold)' : 'Pause'), ['pause', '1']);
    }
    # Keep toggle sticky timestamps; only drop the pause hold so play can start.
    my $id = $client->id() || '';
    delete $playerState{$id}{user_http_paused} if $id;
    eval { Slim::Control::Request::executeRequest($client, ['play']) };
    return (($is_retry ? 'Toggle Play (hold)' : 'Play'), ['play']);
}

sub _httpTogglePlayback {
    my ($client) = @_;
    my $id = $client->id() || '';
    my $now = time();
    my $intent = $playerState{$id}{http_toggle_intent} || '';
    my $at     = $playerState{$id}{http_toggle_at} || 0;
    if (($intent eq 'pause' || $intent eq 'play') && $at && ($now - $at) < $HTTP_TOGGLE_STICKY) {
        # Stream refetch — keep the same pause/play, and refresh the window
        # so back-to-back WiiM retries never flip.
        $playerState{$id}{http_toggle_at} = $now;
        $log->info("HTTP toggle retry holds $intent on " . ($client->name() || $id));
        return _applyHttpPlayIntent($client, $intent, 1);
    }
    my $playing = 0;
    eval { $playing = 1 if $client->isPlaying && !$client->isPaused };
    $intent = $playing ? 'pause' : 'play';
    $playerState{$id}{http_toggle_intent} = $intent;
    $playerState{$id}{http_toggle_at}     = $now;
    $log->info("HTTP toggle -> $intent on " . ($client->name() || $id));
    return _applyHttpPlayIntent($client, $intent, 0);
}

sub _runHttpControl {
    my ($client, $cmd) = @_;
    return unless $client && $cmd;

    my $rpc;
    my $label;

    if ($cmd eq 'play') {
        _clearHttpPaused($client);
        ($label, $rpc) = _applyHttpPlayIntent($client, 'play', 0);
    }
    elsif ($cmd eq 'pause') {
        ($label, $rpc) = _applyHttpPlayIntent($client, 'pause', 0);
    }
    elsif ($cmd eq 'toggle') {
        ($label, $rpc) = _httpTogglePlayback($client);
    }
    elsif ($cmd eq 'stop') {
        _holdHttpPaused($client);
        $rpc = ['stop'];
        eval { Slim::Control::Request::executeRequest($client, $rpc) };
        $label = 'Stop';
    }
    elsif ($cmd eq 'next') {
        _clearHttpPaused($client);
        $rpc = ['playlist', 'index', '+1'];
        eval { Slim::Control::Request::executeRequest($client, $rpc) };
        $label = 'Next';
    }
    elsif ($cmd eq 'prev') {
        _clearHttpPaused($client);
        $rpc = ['playlist', 'index', '-1'];
        eval { Slim::Control::Request::executeRequest($client, $rpc) };
        $label = 'Previous';
    }
    elsif ($cmd eq 'shuffle' || $cmd eq 'shuffle_on' || $cmd eq 'shuffle_off') {
        my $mode;
        if ($cmd eq 'shuffle_on') {
            $mode = 1;
        }
        elsif ($cmd eq 'shuffle_off') {
            $mode = 0;
        }
        else {
            my $cur = eval { Slim::Player::Playlist::shuffle($client) };
            $cur = 0 unless defined $cur;
            $mode = $cur ? 0 : 1;
        }
        $rpc = ['playlist', 'shuffle', $mode];
        eval { Slim::Control::Request::executeRequest($client, $rpc) };
        $label = $mode ? 'Shuffle On' : 'Shuffle Off';
    }
    elsif ($cmd eq 'repeat' || $cmd eq 'repeat_off' || $cmd eq 'repeat_one' || $cmd eq 'repeat_all') {
        my $mode;
        if ($cmd eq 'repeat_off') {
            $mode = 0;
        }
        elsif ($cmd eq 'repeat_one') {
            $mode = 1;
        }
        elsif ($cmd eq 'repeat_all') {
            $mode = 2;
        }
        else {
            my $cur = eval { Slim::Player::Playlist::repeat($client) };
            $cur = 0 unless defined $cur;
            $mode = $cur == 0 ? 2 : ($cur == 2 ? 1 : 0);
        }
        $rpc = ['playlist', 'repeat', $mode];
        eval { Slim::Control::Request::executeRequest($client, $rpc) };
        $label = $mode == 2 ? 'Repeat All' : ($mode == 1 ? 'Repeat One' : 'Repeat Off');
    }
    return ($label, $rpc);
}

sub _startLmsPresetFromWiim {
    my ($client, $preset, $shuffle, $repeat, $from_http) = @_;
    my $id = $client->id();

    Slim::Utils::Timers::killTimers($client, \&_executeLmsPreset);
    Slim::Utils::Timers::killTimers($client, \&_clearLmsPresetPending);
    Slim::Utils::Timers::killTimers($client, \&_applyPresetJsonRpcModes);
    Slim::Utils::Timers::killTimers($client, \&_returnWiimToWifiAfterWebhook);
    Slim::Utils::Timers::killTimers($client, \&_kickHttpPresetPlay);

    $playerState{$id}{lms_preset_pending} = 1;
    $playerState{$id}{is_external} = 0;
    _clearHttpPaused($client);
    $playerState{$id}{preset_play_num}     = $preset;
    $playerState{$id}{preset_play_shuffle} = $shuffle;
    $playerState{$id}{preset_play_repeat}  = $repeat;
    $playerState{$id}{preset_queue_before} = eval { Slim::Player::Playlist::count($client) } || 0;
    $playerState{$id}{preset_queue_before_url} = eval { Slim::Player::Playlist::url($client, 0) } || '';
    delete $playerState{$id}{remoteMeta};
    _markLmsCommit($client, "preset $preset");

    # Shuffle/repeat are prefs only. The CLI playlist shuffle command
    # reshuffles and restarts the queue, which is what made presets 2 and 4
    # wait several seconds.
    eval { Slim::Control::Request::executeRequest($client, ['power', '1']) } unless $client->power();
    eval {
        require Slim::Player::Playlist;
        Slim::Player::Playlist::shuffle($client, 0 + $shuffle) if defined $shuffle;
        Slim::Player::Playlist::repeat($client, 0 + $repeat) if defined $repeat;
    };
    _executeLmsPreset($client, $preset);
    Slim::Utils::Timers::setTimer($client, time() + 12, \&_clearLmsPresetPending, $client);

    # JSON is not audio. One wifi switch puts the renderer back on LMS.
    apiCall($client, 'setPlayerCmd:switchmode:wifi');

    # The remote and the WiiM app are playing this URL as the current
    # source while LMS loads the slot. A failed stream leaves the new
    # queue stopped. The extras menu does not open that URL, so it does
    # not need the second play.
    if ($from_http) {
        $playerState{$id}{pending_lms_play} = 1;
        Slim::Utils::Timers::setTimer($client, time() + 1.5, \&_kickHttpPresetPlay);
        Slim::Utils::Timers::setTimer($client, time() + 4.0, \&_kickHttpPresetPlay);
        Slim::Utils::Timers::setTimer($client, time() + 7.0, \&_kickHttpPresetPlay, 1);
    }
}

# Remote/app only. playlist play is async for Spotify; do not resume the
# previous queue while the new one is still loading. The last timer plays
# even when the new list has the same length as the old one.
sub _kickHttpPresetPlay {
    my ($client, $last) = @_;
    return unless $client && isWiimPlayer($client);
    return if $client->disconnected;
    my $id = $client->id() || return;
    return if $playerState{$id}{user_http_paused};
    return unless $playerState{$id}{lms_preset_pending};
    return unless _hasRealLmsPlaylist($client);
    return if $client->isPlaying && !$client->isPaused;

    my $count = eval { Slim::Player::Playlist::count($client) } || 0;
    my $url = eval { Slim::Player::Playlist::url($client, 0) } || '';
    my $changed = $count != ($playerState{$id}{preset_queue_before} || 0)
        || ($url ne '' && $url ne ($playerState{$id}{preset_queue_before_url} || ''));
    return if !$changed && !$last;
    return if !$count;

    $log->info('Remote preset left the queue stopped on ' . ($client->name() || $id));
    apiCall($client, 'setPlayerCmd:switchmode:wifi');
    eval { Slim::Control::Request::executeRequest($client, ['play']) };
}

sub _returnWiimToWifiAfterWebhook {
    my $client = shift || return;
    my $id = $client->id() || return;
    return if $playerState{$id}{user_http_paused};
    return unless $playerState{$id}{lms_preset_pending} || _lmsCommitHoldActive($id);
    my $mode = $playerState{$id}{mode} // '';
    $mode =~ s/\D//g;
    return if $mode ne '' && _isLiveInputMode($mode);
    $log->info("Return WiiM to wifi after preset webhook on " . ($client->name() || $id)
        . " (mode=" . ($mode eq '' ? '?' : $mode) . ")");
    apiCall($client, 'setPlayerCmd:switchmode:wifi');
}

sub _clearLmsPresetPending {
    my $client = shift || return;
    delete $playerState{$client->id()}{lms_preset_pending};
}

sub _executeLmsPreset {
    my ($client, $preset) = @_;
    return unless $client && $client->id();

    my $slot = _lyrionPresetSlot($client, $preset);
    my $url = $slot->{url} || '';
    my $title = $slot->{text} || '';

    # preset_N.single maps to playPreset_N. A slot stored as type playlist
    # whose URL is remote (Spotify) is fetched as an XML feed. That loads
    # the list and does not start it. playlist play explodes the URL and
    # starts the first track. Button 6 plays slot 7, 70s Road Trip, which
    # is stored that way.
    if ($url ne '') {
        $log->info("Playing LMS preset $preset via playlist play");
        eval { Slim::Music::Info::setTitle($url, $title) } if $title ne '';
        Slim::Control::Request::executeRequest($client, ['playlist', 'play', $url, $title]);
        return;
    }

    $log->info("Playing LMS preset $preset via preset_${preset}.single");
    Slim::Control::Request::executeRequest($client, ['button', "preset_${preset}.single"]);
}

sub _applyPresetJsonRpcModes {
    my $client = shift || return;
    my $id = $client->id() || return;
    my $shuffle = $playerState{$id}{preset_play_shuffle};
    my $repeat  = $playerState{$id}{preset_play_repeat};
    if (!defined $shuffle || !defined $repeat) {
        my $num = $playerState{$id}{preset_play_num};
        if ($num) {
            my ($slot_sh, $slot_rp) = _presetSlotPlayModes($client, $num);
            $shuffle = $slot_sh if !defined $shuffle;
            $repeat  = $slot_rp if !defined $repeat;
        }
    }
    my $target = _playlistClient($client) || $client;
    if (defined $shuffle) {
        $log->info("jsonrpc playlist shuffle $shuffle on " . ($target->name() || $target->id()));
        eval { Slim::Control::Request::executeRequest($target, ['playlist', 'shuffle', $shuffle]) };
    }
    if (defined $repeat) {
        $log->info("jsonrpc playlist repeat $repeat on " . ($target->name() || $target->id()));
        eval { Slim::Control::Request::executeRequest($target, ['playlist', 'repeat', $repeat]) };
    }
}

sub _wantJsonReply {
    my ($qs, $response) = @_;
    return 1 if $qs && $qs =~ /(?:^|&)format=json(?:&|$)/i;
    my $accept = eval { $response->request->header('Accept') } || '';
    return 1 if $accept =~ m{application/json}i && $accept !~ m{audio/}i;
    return 0;
}

# WiiM Home treats shortcut URLs as streams. JSON → "flux inaccessible".
# Inline ~100ms of PCM silence in this same GET (no empty.mp3, no second hop).
my $_silence_wav;
sub _silenceWav {
    return $_silence_wav if $_silence_wav;
    my $n    = 800;
    my $data = "\x00\x00" x $n;
    my $sz   = length($data);
    $_silence_wav = pack('A4VA4A4VvvVVvvA4V',
        'RIFF', 36 + $sz, 'WAVE',
        'fmt ', 16, 1, 1, 8000, 16000, 2, 16,
        'data', $sz
    ) . $data;
    return $_silence_wav;
}

sub _sendSilenceWav {
    my ($httpClient, $response) = @_;
    my $wav = _silenceWav();
    $response->code(200);
    $response->content_type('audio/wav');
    $response->header('Content-Length' => length($wav));
    $response->header('Cache-Control' => 'no-store');
    Slim::Web::HTTP::addHTTPResponse($httpClient, $response, \$wav);
}

sub _replyWebhook {
    my ($httpClient, $response, $want_m3u, $qs, $json) = @_;
    if ($want_m3u) {
        _sendM3U($httpClient, $response, _silenceM3U(($json && $json->{result} && $json->{result}{control}) || 'LMS'));
        return;
    }
    if (_wantJsonReply($qs, $response)) {
        _sendJson($httpClient, $response, $json);
        return;
    }
    _sendSilenceWav($httpClient, $response);
}

sub _serveError {
    my ($httpClient, $response, $msg, $as_json) = @_;
    $log->warn("HTTP endpoint error: $msg");
    if ($as_json) {
        _sendJson($httpClient, $response, { id => 0, error => $msg, result => { ok => 0 } });
        return;
    }
    # Still a valid audio body so WiiM Home does not show "stream inaccessible".
    _sendSilenceWav($httpClient, $response);
}

sub _sendM3U {
    my ($httpClient, $response, $m3u) = @_;
    $response->code(200);
    $response->content_type('audio/x-mpegurl');
    $response->header('Content-Length' => length($m3u));
    Slim::Web::HTTP::addHTTPResponse($httpClient, $response, \$m3u);
}

sub _sendJson {
    my ($httpClient, $response, $data) = @_;
    my $json = eval { encode_json($data) } || '{"ok":0}';
    $response->code(200);
    $response->content_type('application/json; charset=utf-8');
    $response->header('Content-Length' => length($json));
    Slim::Web::HTTP::addHTTPResponse($httpClient, $response, \$json);
}

sub _pollInterval {
    my $client = shift;
    my $pref = $prefs->get('polling_interval') || 8;
    $pref = 4  if $pref < 4;
    $pref = 30 if $pref > 30;
    return $pref unless $client;
    # Keep the normal interval while Lyrion power is off so a WiiM play is
    # noticed without waiting for the player to be powered back on.
    my $id = $client->id();
    return $pref if $playerState{$id}{is_external} || _lmsCommitHoldActive($id) || _userPowerOff($client);
    return $pref < 10 ? 10 : $pref;
}

sub _rescheduleMonitor {
    my ($client) = @_;
    return unless $client;
    Slim::Utils::Timers::killTimers($client, \&monitorStatus);
    Slim::Utils::Timers::setTimer(
        $client,
        time() + _pollInterval($client),
        \&monitorStatus,
        $client
    );
}

sub monitorStatus {
    my ($client) = @_;
    return unless $client;

    # Always reschedule — never let a missing IP, disconnect blip, or API
    # failure permanently kill the poll loop (power off/on used to do that).
    # Standby can drop squeezelite while the WiiM API is still reachable.
    if ($client->disconnected && !_wiimHost($client)) {
        _rescheduleMonitor($client);
        return;
    }

    my $id = $client->id();
    _refreshModel($client) unless $playerState{$id}{project};
    my $started = $playerState{$id}{poll_started} || 0;
    if ($playerState{$id}{poll_inflight} && (time() - $started) < 8) {
        _rescheduleMonitor($client);
        return;
    }
    $playerState{$id}{poll_inflight} = 1;
    $playerState{$id}{poll_started}  = time();

    apiCall($client, 'getPlayerStatus', sub {
        my $status = shift;
        delete $playerState{$id}{poll_inflight};
        # Still apply when we got data; on failure keep prior playerState.
        _applyPlayerStatus($client, $status) if $status || $playerState{$id}{is_external};
        _rescheduleMonitor($client);
    });
}

sub _applyPlayerStatus {
    my ($client, $status) = @_;
    my $id = $client->id();

    unless ($status && ref $status eq 'HASH') {
        if ($playerState{$id}{is_external} && $prefs->get('enable_upnp')) {
            Plugins::WiimIntegration::UPnPHelper::getStatus($client, sub {
                my $upnp = shift || return;
                my $meta = { %{ $playerState{$id}{remoteMeta} || {} } };
                my $ut = _cleanMetaField($upnp->{title}  || '');
                my $ua = _cleanMetaField($upnp->{artist} || '');
                my $ul = _cleanMetaField($upnp->{album}  || '');
                my $uc = _cleanCover($upnp->{cover} || '');
                if (_hasRealTrackMeta($ut, $ua)) {
                    $meta->{title}  = $ut if $ut;
                    $meta->{artist} = $ua if $ua;
                    $meta->{album}  = $ul if $ul;
                }
                $meta->{cover}   ||= $uc;
                $meta->{trackid} ||= $upnp->{trackid} if $upnp->{trackid};
                _storeAndOverlay($client, $meta, 1) if $meta->{title} || $meta->{artist} || $meta->{cover};
            });
        }
        return;
    }

    _normalizeStatus($status);

    my $mode = $status->{mode};
    $mode =~ s/\D//g if defined $mode;
    $playerState{$id}{poll_ok_at} = time();

    # Off in Lyrion: keep the device picture, but do not re-inject Now Playing
    # or start LMS playback while the WiiM is idle (that turns the UI back on).
    # A later play or pause is followed without a Lyrion power command.
    my $resume_follow = 0;
    if (_userPowerOff($client)) {
        my $was_idle = $playerState{$id}{power_off_seen_idle} ? 1 : 0;
        _notePowerOffIdle($id, $status->{status});
        my $ready = $was_idle || _powerOffGraceOver($id);
        if (!$ready || !_devicePlaybackActive($status)) {
            $playerState{$id}{is_external}   = 0;
            $playerState{$id}{external_hits} = 0;
            $playerState{$id}{mode}          = $mode;
            $playerState{$id}{play_state}    = $status->{status};
            $playerState{$id}{poll_count}    = ($playerState{$id}{poll_count} || 0) + 1;
            _noteDeviceVolume($client, $status->{vol}, 0);
            return;
        }
        _setUserPowerOff($client, 0);
        $resume_follow = 1;
        $log->info('WiiM playing while Lyrion was off — following '
            . ($client->name() || $id)
            . ' mode=' . (defined $mode ? $mode : '')
            . ' status=' . ($status->{status} // ''));
    }

    my $prev_mode        = $playerState{$id}{mode};
    my $lms_playlist     = _hasRealLmsPlaylist($client);
    my $mode_is_external = _isExternalMode($mode, $status);
    my $is_live_input    = _isLiveInputMode($mode) ? 1 : 0;

    # Physical source button: Bluetooth/optical → Wi-Fi/LMS. Firmware often
    # reports mode 1 (Network) or residual BT in between; that used to inject
    # a fake AirPlay track and bounce the source.
    if (_isLiveInputMode($prev_mode) && !_isLiveInputMode($mode)) {
        $playerState{$id}{left_live_at} = time();
        my $vendor = lc($status->{vendor} // '');
        my $wifiish = ($mode eq '10' || $mode eq '0' || $mode eq '1'
            || $vendor =~ /squeezelite/i);
        if (!$resume_follow && $wifiish && !_isProvenAppStream($status, $mode) && !_lmsCommitHoldActive($id)) {
            _markLmsCommit($client, "hardware left live mode=$prev_mode → $mode");
            if ($lms_playlist) {
                $playerState{$id}{pending_lms_play} = 1;
                Slim::Utils::Timers::killTimers($client, \&_maybeStartLmsPlayback);
                Slim::Utils::Timers::setTimer($client, time() + 0.8, \&_maybeStartLmsPlayback, $client);
                Slim::Utils::Timers::setTimer($client, time() + 2.5, \&_maybeStartLmsPlayback, $client);
            }
        }
    }

    # Firmware often reports 31/34 while squeezelite is still the LMS renderer
    # (Spotty). That is not Connect/AirPlay — injecting collapses the queue.
    if (!$is_live_input && _lmsHoldsRenderer($client)) {
        $mode_is_external = 0;
        if ($playerState{$id}{is_external} || $playerState{$id}{upnp_app}) {
            $log->info('LMS renderer active — dropping external inject on '
                . ($client->name() || $id) . " mode=$mode");
        }
        $playerState{$id}{is_external}   = 0;
        $playerState{$id}{external_hits} = 0;
        delete $playerState{$id}{upnp_app};
        delete $playerState{$id}{upnp_app_until};
        delete $playerState{$id}{remoteMeta};
    }

    # Spotify Connect (and similar) often stays on mode 10 / vendor squeezelite.
    # UPnP AVTransport events prove the app stream — keep injecting even if HTTP
    # getPlayerStatus still looks like Wi-Fi/LMS. Never while LMS still owns play.
    if (!$mode_is_external && _upnpAppStreamActive($id) && !_blocksExternalInject($client, $mode)) {
        unless ($is_live_input || _lmsHoldsRenderer($client)
            || (_statusLooksLikeLmsLeftover($client, $status) && _hasRealLmsPlaylist($client))) {
            $mode_is_external = 1;
        }
    }

    # Wi-Fi + squeezelite actually playing the LMS queue: not Connect.
    if (($mode eq '10' || $mode eq '0') && _lmsIsActivelyPlaying($client) && !$is_live_input) {
        if ($playerState{$id}{is_external} || $playerState{$id}{upnp_app}) {
            $log->info('LMS squeezelite playing — dropping false external inject on '
                . ($client->name() || $id));
        }
        $mode_is_external = 0;
        $playerState{$id}{is_external}    = 0;
        $playerState{$id}{external_hits}  = 0;
        delete $playerState{$id}{upnp_app};
        delete $playerState{$id}{upnp_app_until};
        delete $playerState{$id}{remoteMeta};
    }

    # Hardware input (BT/optical/…): only drop LMS locks if the user is *not*
    # mid LMS takeover (add/play playlist). Clearing locks here while
    # lms_playlist_control is set made Bluetooth fight the new queue.
    my $lms_takeover_active = _lmsTakeoverPending($id)
        || $playerState{$id}{pending_lms_play}
        || (($playerState{$id}{lms_playlist_control} || 0) && (time() - ($playerState{$id}{lms_playlist_control} || 0)) < 90);

    if ($mode_is_external && $is_live_input) {
        if ($lms_takeover_active || ($lms_playlist && eval { $client->isPlaying && !$client->isPaused })) {
            # User chose LMS content — keep wifi takeover; ignore residual BT mode
            # until takeover window expires or LMS stops.
            $mode_is_external = 0;
            $log->debug('Ignoring live input mode=' . ($mode // '')
                . ' on ' . ($client->name() || $id) . ' during LMS playlist control');
        }
        elsif ($playerState{$id}{left_live_at}
            && (time() - $playerState{$id}{left_live_at}) < 30) {
            # Residual BT for a few polls after leaving — do not re-inject yet.
            $mode_is_external = 0;
        }
        else {
            _clearLmsTakeoverLocks($client, 'live input mode=' . ($mode // ''));
        }
    }
    elsif ($mode_is_external && _lmsTakeoverPending($id)) {
        # Residual BT / empty Network blip must not clear LMS locks.
        # A real Connect/AirPlay track (proven meta) is the user taking the speaker.
        if (!_isLiveInputMode($mode) && _isProvenAppStream($status, $mode)
                && !_lmsHoldsRenderer($client)) {
            _clearLmsTakeoverLocks($client, 'HTTP app stream mode=' . ($mode // ''));
        }
        else {
            $mode_is_external = 0;
        }
    }

    my $blocked = _blocksExternalInject($client, $mode);

    # Consecutive-poll confirmation before treating as external (Wi-Fi glitch guard).
    # Residual BT after leaving a live input, and Network/AirPlay, need extra hits.
    my $need_hits;
    if ($is_live_input) {
        if ($lms_takeover_active) {
            $need_hits = 99;
        }
        elsif ($playerState{$id}{left_live_at}
            && (time() - $playerState{$id}{left_live_at}) < 30) {
            $need_hits = $AMBIGUOUS_CONFIRM_POLLS;
        }
        else {
            $need_hits = 1;
        }
    }
    elsif (_upnpAppStreamActive($id) || $mode eq '31' || $mode eq '32' || $mode eq '36' || $mode eq '47') {
        $need_hits = 1;
    }
    elsif ($mode eq '1' || $mode eq '34') {
        $need_hits = _isProvenAppStream($status, $mode) ? 1 : $AMBIGUOUS_CONFIRM_POLLS;
    }
    elsif ($mode ne '' && $EXTERNAL_MODES{$mode}) {
        $need_hits = 2;
    }
    else {
        $need_hits = $EXTERNAL_CONFIRM_POLLS;
    }
    if ($mode_is_external && !$blocked) {
        $playerState{$id}{external_hits} = ($playerState{$id}{external_hits} || 0) + 1;
    }
    else {
        $playerState{$id}{external_hits} = 0;
    }

    my $confirmed = ($playerState{$id}{external_hits} || 0) >= $need_hits;
    my $is_external = ($confirmed && !$blocked && $mode_is_external) ? 1 : 0;

    if ($is_external) {
        if (!$playerState{$id}{is_external}) {
            $log->info('External mode confirmed on ' . ($client->name() || $id)
                . " mode=$mode (" . _modeLabelFromStatus($mode, $status) . ')'
                . ($is_live_input ? ' [live input]' : ''));
        }
        $playerState{$id}{is_external} = 1;
        delete $playerState{$id}{left_live_at} if $is_live_input;
        # Drop deferred LMS takeover — device is streaming externally.
        if (delete $playerState{$id}{want_lms_control}) {
            $log->info('Dropped deferred LMS takeover on ' . ($client->name() || $id)
                . ' (external stream active)');
        }
    }
    else {
        if ($playerState{$id}{is_external}) {
            $log->info('Leaving external inject on ' . ($client->name() || $id)
                . ($blocked ? ' (blocked by LMS/sync/queue)' : '')
                . " mode=$mode");
        }
        $playerState{$id}{is_external} = 0;
        if ($mode eq '10' || $mode eq '0' || ($status->{vendor} || '') =~ /squeezelite/i) {
            delete $playerState{$id}{lms_playlist_control} if $lms_playlist && ($playerState{$id}{lms_playlist_control} || 0)
                && (time() - $playerState{$id}{lms_playlist_control}) > 30;
            delete $playerState{$id}{pending_lms_play} if $client->isPlaying && !$client->isPaused;
            # Apply deferred LMS content request now that we know we are on wifi.
            if (delete $playerState{$id}{want_lms_control}) {
                if ($resume_follow) {
                    $log->info('Skip deferred LMS takeover on ' . ($client->name() || $id)
                        . ' (following WiiM while Lyrion was off)');
                }
                elsif (_isProvenAppStream($status, $mode) || $mode eq '31' || $mode eq '34') {
                    $log->info('Skip deferred LMS takeover on ' . ($client->name() || $id)
                        . " (app stream mode=$mode)");
                }
                else {
                    Slim::Utils::Timers::setTimer($client, time() + 0.2, sub {
                        my $c = shift || return;
                        _takeLmsPlaylistControl($c, 1);
                    }, $client);
                }
            }
        }
    }
    _noteDeviceVolume($client, $status->{vol}, $is_external);
    $playerState{$id}{mode}          = $mode;
    if (!(_upnpAppStreamActive($id) && $playerState{$id}{remoteMeta} && $playerState{$id}{remoteMeta}{mode})) {
        $playerState{$id}{mode_name} = _modeLabelFromStatus($mode, $status);
    }
    # Live inputs: WiiM status often flips play→stop after switchmode even though
    # the input is active. Normalize so LMS transport UI stays on pause (playing).
    $playerState{$id}{play_state}    = _normalizeLivePlayState($mode, $status->{status});
    Plugins::WiimIntegration::DlnaRenderer::note_source($client);
    # Live hardware inputs (BT / Optical / RCA / …) are continuous streams.
    # WiiM often still reports a leftover totlen from a prior track — ignore it
    # so Material uses streaming-mode progress (no seekable bar).
    if (_isLiveInputMode($mode)) {
        $playerState{$id}{time}     = 0;
        $playerState{$id}{duration} = 0;
    }
    else {
        $playerState{$id}{time}     = int(($status->{curpos}  // 0) / 1000);
        $playerState{$id}{duration} = int(($status->{totlen}  // 0) / 1000);
    }
    $playerState{$id}{poll_count}    = ($playerState{$id}{poll_count} || 0) + 1;

    my $preset_at = $playerState{$id}{preset_fetch_at} || 0;
    if ($is_external && (time() - $preset_at) > 60) {
        $playerState{$id}{preset_fetch_at} = time();
        apiCall($client, 'getPresetInfo', sub {
            my $data = shift || {};
            $playerState{$id}{presets} = $data->{preset_list} || [];
        });
    }

    # Discover Spotify Connect / AirPlay via UPnP even when HTTP status still
    # looks like Wi-Fi (mode 10). Events are primary; SOAP is a slow fallback.
    if ($prefs->get('enable_upnp') && !$is_external) {
        my $last = $playerState{$id}{upnp_event_at} || $playerState{$id}{upnp_poll_at} || 0;
        if (!$last || (time() - $last) >= 30) {
            $playerState{$id}{upnp_poll_at} = time();
            Plugins::WiimIntegration::UPnPHelper::getStatus($client, sub {
                my $upnp = shift || return;
                _onUPnPMetadata($client, $upnp);
            });
        }
    }

    return unless $is_external || ($status->{title} || $status->{artist});

    my $mode_name = $playerState{$id}{mode_name};
    my $is_live   = _isLiveInputMode($mode) ? 1 : 0;
    my $meta = {
        title      => _cleanMetaField($status->{title}  || ''),
        artist     => _cleanMetaField($status->{artist} || ''),
        album      => _cleanMetaField($status->{album}  || ''),
        cover      => _cleanCover($status->{cover} || $status->{albumarturi} || $status->{albumArtURI} || ''),
        arturl     => _cleanCover($status->{pic_url} || $status->{PicUrl} || ''),
        type       => 'wiim',
        mode       => $mode_name,
        live_input => $is_live,
    };

    # Keep UPnP (Spotify Connect) metadata if HTTP getPlayerStatus is empty leftover.
    if (_upnpAppStreamActive($id) && !_hasRealTrackMeta($meta->{title}, $meta->{artist})) {
        my $prev = $playerState{$id}{remoteMeta} || {};
        $meta->{title}  = $prev->{title}  if $prev->{title};
        $meta->{artist} = $prev->{artist} if $prev->{artist};
        $meta->{album}  = $prev->{album}  if $prev->{album};
        $meta->{cover}  ||= $prev->{cover};
        $meta->{mode}   = $prev->{mode} if $prev->{mode};
        $mode_name = $meta->{mode} if $meta->{mode};
    }

    # Live hardware inputs: use "Bluetooth Input" / "Optical Input" / "RCA Input"
    # unless the source itself provided real track metadata (common for Bluetooth).
    if ($is_live && !_hasRealTrackMeta($meta->{title}, $meta->{artist})) {
        my %live = _liveInputMetadata($client, $mode_name, $mode);
        $meta->{title}  = $live{title};
        $meta->{artist} = $live{artist};
        $meta->{album}  = $live{album};
        $meta->{mode}   = $live{title};
    }

    # Push title/artist immediately; fill cover from GetInfoEx without delaying the np-bar.
    _storeAndOverlay($client, $meta, $is_external);
    if ($is_external && !$playerState{$id}{remoteMeta}{cover}) {
        _fetchMetaCover($client);
        _fetchUpnpNow($client, 'http-missing-cover') if $prefs->get('enable_upnp');
    }
    elsif ($prefs->get('enable_upnp') && $is_external
            && !_hasRealTrackMeta($meta->{title}, $meta->{artist})) {
        _fetchUpnpNow($client, 'http-missing-cover');
    }
}

# getPlayerStatus has no cover for Spotify Connect. Keep the last real cover
# for this track so a later poll does not open a hole that Material fills
# with the Lyrion queue artwork.
sub _retainCover {
    my ($meta, $prev) = @_;
    return unless $meta && $prev && ref $prev eq 'HASH';
    return if _cleanCover($meta->{cover} || $meta->{arturl} || '');
    my $kept = _cleanCover($prev->{cover} || $prev->{arturl} || '');
    return unless $kept;
    my $new_title = _normTitle($meta->{title} || '');
    my $old_title = _normTitle($prev->{title} || '');
    return if $new_title && $old_title && $new_title ne $old_title;
    $meta->{cover} = $kept;
}

sub _fetchMetaCover {
    my $client = shift || return;
    my $id = $client->id() || return;
    return if $playerState{$id}{meta_cover_busy};
    my $last = $playerState{$id}{meta_cover_at} || 0;
    return if $last && (time() - $last) < 8;
    $playerState{$id}{meta_cover_busy} = 1;
    $playerState{$id}{meta_cover_at}   = time();
    apiCall($client, 'getMetaInfo', sub {
        delete $playerState{$id}{meta_cover_busy};
        my $data = shift || return;
        my $md = $data->{metaData} || $data;
        return unless ref $md eq 'HASH';
        my $cover = '';
        for my $key (keys %$md) {
            next unless $key =~ /albumArtURI/i;
            $cover = _cleanCover($md->{$key});
            last if $cover;
        }
        return unless $cover;
        my $prev = $playerState{$id}{remoteMeta} || return;
        return if ($prev->{cover} || '') eq $cover;
        my $meta = { %$prev, cover => $cover };
        _storeAndOverlay($client, $meta, 1);
    });
}

# Lyrion power off must silence the speaker, not only the squeezelite UI.
# setShutdown:0 is immediate standby; stop first so Spotify/BT does not resume.
sub _stopWiimForPowerOff {
    my $client = shift || return;
    return unless isWiimPlayer($client);
    my $id = $client->id() || return;
    my $now = time();
    return if ($playerState{$id}{wiim_stopped_at} || 0) >= $now;
    $playerState{$id}{wiim_stopped_at} = $now;
    $log->info('WiiM stop+standby on Lyrion power off: ' . ($client->name() || $id));
    apiCall($client, 'setPlayerCmd:stop', sub {
        apiCall($client, 'setShutdown:0');
    });
}

sub _storeAndOverlay {
    my ($client, $meta, $is_external) = @_;
    my $id = $client->id();

    my $prev = $playerState{$id}{remoteMeta} || {};
    _retainCover($meta, $prev);
    my $changed = _metaSignature($prev) ne _metaSignature($meta);
    $playerState{$id}{remoteMeta} = $meta;

    # Controllers learn the new track from the next status query. A popup or a
    # streaming heartbeat forces Now Playing on a Squeezebox Radio and holds
    # the buttons until it times out.
    if ($changed) {
        $playerState{$id}{feed_ts} = time();
    }
    $playerState{$id}{feed_ts} ||= time();
    if ($changed && ($is_external || _userPowerOff($client))) {
        _refreshExternalStatus($client);
    }
    Plugins::WiimIntegration::DlnaRenderer::note_source($client);
}

# wiimrelay:// and the relay URL both name the source WiiM.
sub _relaySourceId {
    my $url = shift || return '';
    if ($url =~ m{^wiimrelay://([0-9a-f:]+)}i) {
        return lc $1;
    }
    if ($url =~ /(?:^|[?&])wiim=([^&#]+)/) {
        my $id = eval { Slim::Utils::Misc::unescape($1, 1) } || $1;
        return lc $id;
    }
    if ($url =~ m{^https?://([^/:]+)}i) {
        my $host = lc $1;
        for my $wiim (_allWiimClients()) {
            my $ip = eval { $wiim->ip() } || '';
            $ip =~ s/:\d+$//;
            next unless $ip && lc($ip) eq $host;
            return lc($wiim->id() || '');
        }
    }
    return '';
}

# Plain hash for RelayProto::getMetadataFor. cover is already an /imageproxy
# path, which Queries and the player screen leave unchanged.
sub _relayDisplayMeta {
    my ($url, $client) = @_;
    my $id = _relaySourceId($url);
    return unless $id;

    my $wiim = _wiimClientById($id);
    my $st = {};
    my $rm = {};
    if ($wiim) {
        $st = $playerState{$wiim->id()} || $playerState{$id} || {};
        $rm = $st->{remoteMeta} || {};
    }
    my $dlna = eval { Plugins::WiimIntegration::DlnaRenderer::status() } || {};
    my $same = ($dlna->{source_id} || '') eq $id;

    my $title  = _cleanMetaField($rm->{title}  || ($same ? ($dlna->{title}  || '') : ''));
    my $artist = _cleanMetaField($rm->{artist} || ($same ? ($dlna->{artist} || '') : ''));
    my $album  = _cleanMetaField($rm->{album}  || '');
    my $raw_cover = _cleanCover($rm->{cover} || $rm->{arturl} || ($same ? ($dlna->{cover} || '') : ''));
    my $cover = _artworkUrl($raw_cover) || '';
    my $live = ($rm->{live_input} || _isLiveInputMode($st->{mode} // '')) ? 1 : 0;
    my $duration = $live ? 0 : (0 + ($st->{duration} || 0));

    # LMS queue on the WiiM (Spotify, radio) keeps title and art on the track.
    # remoteMeta is only filled for an external input. Use the track when the
    # WiiM metadata is still empty. Never follow wiimrelay:// back into here.
    if ($wiim && !$live && ($title eq '' || $cover eq '')) {
        my $song = eval { $wiim->playingSong() || $wiim->streamingSong() };
        my $track = $song && eval { $song->currentTrack() };
        my $turl = ($track && eval { $track->url() }) || '';
        if ($turl && $turl !~ m{^wiimrelay://}i && $turl !~ m{/plugins/WiimIntegration/relay\.}) {
            my $handler = eval { Slim::Player::ProtocolHandlers->handlerForURL($turl) } || '';
            if ($handler && $handler ne 'Plugins::WiimIntegration::RelayProto' && eval { $handler->can('getMetadataFor') }) {
                my $extra = eval { $handler->getMetadataFor($wiim, $turl) } || {};
                if (ref $extra eq 'HASH') {
                    $title  = _cleanMetaField($extra->{title})  if $title eq ''  && $extra->{title};
                    $artist = _cleanMetaField($extra->{artist}) if $artist eq '' && $extra->{artist};
                    $album  = _cleanMetaField($extra->{album})  if $album eq ''  && $extra->{album};
                    if ($cover eq '' && $extra->{cover}) {
                        $cover = _artworkUrl(_cleanCover($extra->{cover})) || '';
                    }
                    if (!$duration && ($extra->{duration} || $extra->{secs})) {
                        $duration = 0 + ($extra->{duration} || $extra->{secs});
                    }
                }
            }
            if ($title eq '' && $track) {
                my $t = eval { $track->title() } || '';
                $title = _cleanMetaField($t) if $t ne '' && $t !~ m{://};
            }
        }
    }

    # Top-level status duration is the song object's, not the metadata hash.
    if ($client && $duration > 0) {
        my $song = eval { $client->currentSongForUrl($url) };
        if ($song && (($song->duration() || 0) != $duration)) {
            eval { $song->duration($duration) };
        }
    }

    my $meta = {
        duration => $duration,
        secs     => $duration,
        type     => 'mp3',
        live     => $live,
    };
    $meta->{title}  = $title  if $title ne '';
    $meta->{artist} = $artist if $artist ne '';
    $meta->{album}  = $album  if $album ne '';
    if ($cover ne '') {
        $meta->{cover} = $cover;
        $meta->{icon}  = $cover;
    }
    return $meta;
}

# Material hides the progress bar while duration is 0, and shows the default
# cover when artwork_url is missing. This fills both on the player that is
# actually hearing the relay. Seek stays off: the relay is not the WiiM.
sub _overlayRelayDestination {
    my ($request, $client) = @_;
    return unless $client && !isWiimPlayer($client);

    my $playing = _dlnaCurrentUrl($client);
    my $url = '';
    if (_dlnaIsRelayUrl($playing)) {
        $url = $playing;
    }
    else {
        my $mode = $request->getResult('mode') || '';
        return unless $mode eq 'stop' || $mode eq '';
        $url = eval { $request->getResultLoop('playlist_loop', 0, 'url') } || '';
        return unless _dlnaIsRelayUrl($url);
    }

    my $meta = _relayDisplayMeta($url, $client) || return;
    my $duration = 0 + ($meta->{duration} || 0);
    $request->addResult('duration', $duration);
    $request->addResult('can_seek', 0);
    $request->addResult('repeating_stream', ($meta->{live} || !$duration) ? 1 : 0);
    $request->addResultLoop('playlist_loop', 0, 'duration', $duration);
    if ($meta->{title}) {
        $request->addResultLoop('playlist_loop', 0, 'title', $meta->{title});
        my $line = join(' - ', grep { defined $_ && $_ ne '' } ($meta->{artist}, $meta->{title}));
        $request->addResult('current_title', $line) if $line ne '';
    }
    $request->addResultLoop('playlist_loop', 0, 'artist', $meta->{artist}) if $meta->{artist};
    $request->addResultLoop('playlist_loop', 0, 'album', $meta->{album}) if $meta->{album};
    $request->addResultLoop('playlist_loop', 0, 'artwork_url', $meta->{cover}) if $meta->{cover};
    $request->addResult('remoteMeta', {
        title       => $meta->{title}  || '',
        artist      => $meta->{artist} || '',
        album       => $meta->{album}  || '',
        artwork_url => $meta->{cover}  || '',
        live        => $meta->{live} ? 1 : 0,
    });
}

sub wiimStatusQuery {
    my ($request) = @_;
    eval {
        $statusHandler->($request) if $statusHandler;
        1;
    } or do {
        $log->warn('Base LMS status failed (Spotty/other); WiiM inject may still apply: ' . ($@ || ''));
    };

    my $client = $request->client() || return;
    # Destination of a redistributed stream: paint the WiiM cover and length
    # onto this player. The WiiM's own status inject below stays separate.
    _overlayRelayDestination($request, $client);
    _annotateDiffuseStatus($request, $client);
    return unless isWiimPlayer($client);

    my $id = $client->id();
    my $state = $playerState{$id} || {};
    # Off in Lyrion: do not leave a stale "play" mode from the last inject.
    if (_userPowerOff($client)) {
        $request->addResult('power', 0);
        $request->addResult('mode', 'off');
        return;
    }
    return unless $state->{is_external};
    # App-external still blocked by residual LMS queue / sync; live inputs are not.
    return if _blocksExternalInject($client, $state->{mode});
    # User powered off in Lyrion: leave LMS status alone (power=0, no fake track).
    return unless _canPresentExternal($client, $state);
    # Live LMS renderer: never replace the real status (queue would collapse to 1).
    my $mode_now = $state->{mode} // '';
    $mode_now =~ s/\D//g;
    return if _lmsHoldsRenderer($client) && !_isLiveInputMode($mode_now);

    _injectExternalStatus($request, $client, $state);
}

sub _injectExternalStatus {
    my ($request, $client, $state) = @_;
    return unless _canPresentExternal($client, $state);

    my $meta = $state->{remoteMeta} || {
        title  => '',
        artist => '',
        album  => '',
        mode   => $state->{mode_name} || 'External',
    };

    my $mode_num_early = $state->{mode} // '';
    $mode_num_early =~ s/\D//g;
    # Safety net: never overwrite playlist_tracks while LMS still owns playback.
    return if _lmsHoldsRenderer($client) && !_isLiveInputMode($mode_num_early);
    my $wiim_mode = _normalizeLivePlayState($mode_num_early, $state->{play_state});
    $wiim_mode = 'play'  if $wiim_mode eq 'play';
    $wiim_mode = 'pause' if $wiim_mode eq 'pause' || $wiim_mode eq 'paused';
    $wiim_mode = 'stop'  unless $wiim_mode =~ /^(?:play|pause)$/;
    # Live inputs already normalized to play/pause; keep play for continuous sources.
    if (_isLiveInputMode($mode_num_early) && $wiim_mode eq 'stop') {
        $wiim_mode = 'play';
    }

    # External playback (Spotify Connect, Bluetooth, …) is independent of squeezelite
    # power. Report On so the device list / toolbar are not dimmed as Off —
    # unless the user explicitly powered off in Lyrion (see _canPresentExternal).
    $request->addResult('power', 1);
    $request->addResult('mode', $wiim_mode);
    $request->addResult('playlist_tracks', 1);
    $request->addResult('playlist_cur_index', 0);
    $request->addResult('can_seek', 0);
    $request->addResult('remote', 1);
    $request->addResult('repeat', 0);
    $request->addResult('shuffle', 0);
    # Do not force sync=0 — leave base status sync fields intact so groups stay groups.
    my $mode_num = $state->{mode} // '';
    $mode_num =~ s/\D//g;
    my $is_live_input = $meta->{live_input} || _isLiveInputMode($mode_num);

    # Live inputs: force streaming-mode progress in Material (duration<=0 hides
    # the seek bar and centers elapsed time). Always overwrite any duration the
    # base status handler may have set from a leftover LMS/WiiM totlen.
    if ($is_live_input) {
        $request->addResult('time', 0);
        $request->addResult('duration', 0);
        $request->addResult('repeating_stream', 1);
    }
    else {
        $request->addResult('time', $state->{time} // 0);
        $request->addResult('duration', $state->{duration} // 0) if $state->{duration};
        $request->addResult('repeating_stream', 0);
    }

    my $mode_name = _liveInputLabel($mode_num, $meta->{mode} || $state->{mode_name} || 'External');
    my $title  = _cleanMetaField($meta->{title}  || '');
    my $artist = _cleanMetaField($meta->{artist} || '');
    my $album  = _cleanMetaField($meta->{album}  || '');

    if ($is_live_input && !_hasRealTrackMeta($title, $artist)) {
        my %live = _liveInputMetadata($client, $mode_name, $mode_num);
        $title  = $live{title};
        $artist = $live{artist};
        $album  = $live{album};
        $mode_name = $live{title};
    }
    else {
        $title ||= $mode_name unless $is_live_input;
        # Keep real Bluetooth (etc.) track fields; mode_name remains the input type.
    }

    my $art    = _artworkUrl(_cleanCover($meta->{cover} || $meta->{arturl} || ''));
    # No artwork_url makes Material load /music/current/cover.jpg, the Lyrion
    # queue cover. html/images/cover.png resolves to the empty cover instead.
    $art ||= 'html/images/cover.png';
    my $source_url = _materialSourceUrl($mode_name);
    my $stream_url = $is_live_input ? _wiimStreamUrl($client, $mode_name) : $source_url;

    my $track = {
        title         => $title,
        artist        => $artist,
        album         => $album,
        trackartist   => $artist,
        albumartist   => $artist,
        url           => $stream_url,
        extid         => 'wiim',
        remote        => 1,
        # 0 duration ⇒ Material treats as live stream (no seekable progress bar,
        # centered elapsed time via duration<=0).
        duration      => $is_live_input ? 0 : ($state->{duration} // 0),
        'playlist index' => 0,
        # Material Skin uses this to disable Music Artist Info on live inputs.
        live          => $is_live_input ? 1 : 0,
        repeating_stream => $is_live_input ? 1 : 0,
    };
    $track->{artwork_url} = $art if $art;
    # Numeric id, same convention as an LMS remote stream. A fake coverid
    # makes the Radio request /music/<id>/cover and sit on a spinner.
    $track->{id} = _wiimTrackId(join('|', $stream_url, $title, $artist, $album));
    $track->{remote_title} = $mode_name;
    $track->{name} = $is_live_input && !_hasRealTrackMeta($meta->{title}, $meta->{artist})
        ? $mode_name
        : ($title || $mode_name);

    $request->addResult('playlist_loop', [$track]);

    # SqueezePlay's Now Playing subscription is "status … menu:menu". It paints
    # item_loop[1].track/artist/album and ignores current_title once .track is
    # set, so the LMS queue's first row stayed on screen. params must exist or
    # _whatsPlaying never notices a new title. A numeric track_id or icon-id is
    # fetched as /music/<id>/cover and spins, so artwork is a proxied path.
    my $line = $title || $mode_name;
    my $second = join(' - ', grep { defined $_ && $_ ne '' } ($artist, $album));
    my $item = {
        trackType => 'radio',
        track     => $line,
        artist    => $artist || '',
        album     => $album || '',
        text      => ($second ne '' ? "$line\n$second" : $line),
        style     => 'itemplay',
        params    => {
            playlist_index => 0,
        },
    };
    if ($art) {
        $item->{icon} = $art;
    }
    else {
        $item->{'icon-id'} = '/html/images/radio.png';
    }
    # menu:menu is the SqueezePlay status subscription. Leave non-menu
    # status (Material, web) on playlist_loop so count stays the queue length.
    if (defined $request->getParam('menu') || $request->getResult('item_loop')) {
        $request->addResult('item_loop', [$item]);
        $request->addResult('count', 1);
        $request->addResult('offset', 0);
    }

    my %remote = (
        title  => $title,
        artist => $artist,
        album  => $album,
        type   => $mode_name,
        url    => $source_url,
        extid  => 'wiim',
        live   => $is_live_input ? 1 : 0,
    );
    my $cover = _cleanCover($meta->{cover} || $meta->{arturl} || '');
    $remote{cover} = $cover if $cover;
    $remote{artwork_url} = $art if $art;
    $remote{id} = $track->{id};
    $request->addResult('remoteMeta', \%remote);
    # Stable across polls. Bumping this every status reply makes SqueezePlay
    # reload Now Playing and drop the menu.
    $state->{feed_ts} ||= time();
    $request->addResult('playlist_timestamp', $state->{feed_ts});

    my $current_title;
    if ($is_live_input && !_hasRealTrackMeta($meta->{title}, $meta->{artist})) {
        $current_title = $mode_name;
    }
    else {
        $current_title = join(' - ', grep { $_ } ($artist, $title)) || $mode_name;
    }
    $request->addResult('current_title', $current_title);
}

# Negative id: LMS uses that for remote tracks, and the Radio treats it as a feed.
sub _wiimTrackId {
    my $key = shift || 'wiim';
    my $n = hex(substr(md5_hex($key), 0, 7));
    $n ||= 1;
    return -1 * $n;
}

my %apiWarnAt;
my %_artProxy;
sub _artworkUrl {
    my $cover = shift || return;
    return $cover if $cover =~ m{^/};
    return $_artProxy{$cover} if $_artProxy{$cover};
    require Slim::Web::ImageProxy;
    my $url = Slim::Web::ImageProxy::proxiedImage($cover);
    %_artProxy = () if keys(%_artProxy) > 48;
    $_artProxy{$cover} = $url if $url;
    return $url;
}

sub _menuText {
    my ($client, $token, $fallback) = @_;
    my $text = $client ? $client->string($token) : string($token);
    return $text if defined $text && $text ne '' && $text ne $token;
    return $fallback;
}

sub _addMenuItems {
    my ($request, @items) = @_;
    my $cnt = 0;

    $request->addResult('offset', 0);
    $request->addResult('window', { windowStyle => 'text_list' });

    foreach my $item (@items) {
        $request->addResultLoop('item_loop', $cnt, 'id', $item->{id}) if $item->{id};
        $request->addResultLoop('item_loop', $cnt, 'text', $item->{text});
        $request->addResultLoop('item_loop', $cnt, 'type', $item->{type}) if $item->{type};
        $request->addResultLoop('item_loop', $cnt, 'radio', $item->{radio}) if defined $item->{radio};
        $request->addResultLoop('item_loop', $cnt, 'url', $item->{url}) if $item->{url};
        my $icon_id = $item->{'icon-id'} || $item->{icon_id};
        $request->addResultLoop('item_loop', $cnt, 'icon-id', $icon_id) if $icon_id;
        $request->addResultLoop('item_loop', $cnt, 'actions', $item->{actions}) if $item->{actions};
        for my $field (qw(kind source wiim_name pic)) {
            my $val = $item->{$field};
            $request->addResultLoop('item_loop', $cnt, $field, $val) if defined $val && $val ne '';
        }
        $request->addResultLoop('item_loop', $cnt, 'lms_slot', 0 + $item->{lms_slot}) if $item->{lms_slot};
        $request->addResultLoop('item_loop', $cnt, 'copyable', $item->{copyable} ? 1 : 0) if exists $item->{copyable};
        $cnt++;
    }
    $request->addResult('count', $cnt);
    $request->setStatusDone();
}

sub menuQuery {
    my ($request) = @_;
    my $client = $request->client();

    unless ($client && isWiimPlayer($client)) {
        my @wiim_clients = _allWiimClients();
        if (@wiim_clients) {
            _addMenuItems($request, map {
                my $name = $_->name() || $_->id();
                my $direct = _directStreamUrl($_);
                my $id = $_->id();
                $direct ? {
                    id      => 'wiim_stream_' . $id,
                    text    => $name . "\n" . _menuText($client, 'STREAM_LISTEN', 'Listen'),
                    type    => 'audio',
                    url     => $direct,
                    icon_id => 'MTL_svg_stream',
                    actions => {
                        go   => { cmd => ['wiimintegration', 'listen', $id], player => 0 },
                        play => { cmd => ['wiimintegration', 'listen', $id], player => 0 },
                    },
                } : {
                    id   => 'wiim_stream_' . $id,
                    text => $name . "\n" . _menuText($client, 'STREAM_NO_HTTP', 'No HTTP stream to play here'),
                };
            } @wiim_clients);
        }
        else {
            _addMenuItems($request, {
                text => _menuText($client, 'NO_WIIM_PLAYERS', 'No WiiM players found'),
            });
        }
        return;
    }

    my @menu = (
        {
            id      => 'wiim_source_menu',
            text    => _menuText($client, 'SELECT_SOURCE', 'Select Source'),
            icon_id => 'MTL_icon_input',
            actions => { go => { cmd => ['wiimintegration', 'sources'], player => 0 } },
        },
    );
    if (_lineoutModes($client)) {
        push @menu, {
            id      => 'wiim_lineout_menu',
            text    => _menuText($client, 'SELECT_LINEOUT', 'Select Line Out'),
            icon_id => 'MTL_icon_settings_input_component',
            actions => { go => { cmd => ['wiimintegration', 'lineouts'], player => 0 } },
        };
    }
    push @menu, {
        id      => 'wiim_preset_menu',
        text    => _menuText($client, 'SELECT_PRESET', 'Select Preset'),
        icon_id => 'MTL_icon_star',
        actions => { go => { cmd => ['wiimintegration', 'presets'], player => 0 } },
    };
    _addMenuItems($request, @menu);
}

sub listenCommand {
    my ($request) = @_;
    my $client = $request->client();
    my $wiim_id = $request->getParam('_wiimid') || $request->getRequest(2) || '';
    my $wiim = _wiimClientById($wiim_id);
    unless ($client && $wiim && _playDirectOn($client, $wiim)) {
        $request->setStatusBadParams();
        return;
    }
    $request->setStatusDone();
}

sub sourcesQuery {
    my ($request) = @_;
    my $client = $request->client();
    return $request->setStatusBadParams() unless $client && isWiimPlayer($client);

    _addMenuItems($request, map {
        {
            id         => 'wiim_source_' . $_->{cmd},
            text       => $_->{label},
            icon_id    => $_->{icon_id},
            nextWindow => 'parent',
            actions    => {
                do => {
                    cmd        => ['wiimintegration', 'source', $_->{cmd}],
                    player     => 0,
                    nextWindow => 'parent',
                },
            },
        }
    } _sourceModes($client));
}

sub _presetMenuRow {
    my ($client, $num, $key) = @_;
    $key ||= {};
    my $name = $key->{name} || "Preset $num";
    # Same title as the editor row: the Lyrion slot on this button number.
    # wiim_name stays the hardware name, which is what the button plays.
    my $slot = _lyrionPresetSlot($client, $num);
    my $lyrion = Plugins::WiimIntegration::PresetKeys::clean_name($slot->{text} || '');
    my $text = $lyrion ne '' ? $lyrion : $name;
    return {
        id         => 'wiim_preset_' . $num,
        text       => $text,
        url        => $key->{url} || '',
        kind       => $key->{kind} || '',
        source     => $key->{source} || '',
        wiim_name  => $key->{name} || '',
        pic        => $key->{pic} || '',
        lms_slot   => $key->{lms_slot} || 0,
        copyable   => $key->{copyable} ? 1 : 0,
        icon_id    => 'MTL_icon_star',
        nextWindow => 'parent',
        actions    => {
            do => {
                cmd        => ['wiimintegration', 'preset', $num],
                player     => 0,
                nextWindow => 'parent',
            },
        },
    };
}

sub _presetMenuItems {
    my $client = shift || return;
    my $id = $client->id() || return;
    my $max = Plugins::WiimIntegration::PresetKeys::editor_slots();
    my @items;
    my $keys = $playerState{$id}{preset_keys};
    if ($keys && ref $keys eq 'HASH' && %$keys) {
        for my $n (1 .. $max) {
            my $key = $keys->{$n};
            next unless $key && ref $key eq 'HASH';
            if (($key->{kind} || '') eq 'empty') {
                next unless _lyrionPresetSlot($client, $n)->{has};
            }
            push @items, _presetMenuRow($client, $n, $key);
        }
        return @items;
    }
    my $list = $playerState{$id}{presets} || [];
    for my $p (@$list) {
        next unless ref $p eq 'HASH';
        my $n = $p->{number} || $p->{preset_num} || 0;
        next unless $n >= 1 && $n <= $max;
        my $key = Plugins::WiimIntegration::PresetKeys::classify_fields(
            name    => $p->{name},
            url     => $p->{url} || $p->{URL} || '',
            source  => $p->{source} || '',
            pic     => $p->{picurl} || $p->{pic} || '',
            routine => $p->{routine} || '',
        );
        $key->{number} = 0 + $n;
        push @items, _presetMenuRow($client, $n, $key);
    }
    return @items;
}

sub presetsQuery {
    my ($request) = @_;
    my $client = $request->client();
    return $request->setStatusBadParams() unless $client && isWiimPlayer($client);

    _ensurePresetKeys($client, 1);
    my $id = $client->id() || '';
    my $known = ($id && $playerState{$id}{preset_keys} && %{ $playerState{$id}{preset_keys} })
        || ($id && $playerState{$id}{presets} && @{ $playerState{$id}{presets} });
    my @items = _presetMenuItems($client);
    if (!@items && !$known) {
        @items = map { _presetMenuRow($client, $_, undef) } 1 .. 6;
    }
    if (!@items) {
        _addMenuItems($request, { text => _menuText($client, 'SELECT_PRESET', 'Select Preset') });
        return;
    }
    _addMenuItems($request, @items);
}

sub sourceCommand {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();
    return $request->setStatusBadParams() unless isWiimPlayer($client);

    my $src = $request->getParam('_cmd') || $request->getRequest(2) || '';
    $src = '' if $src =~ /^\d+$/;
    return $request->setStatusBadParams() unless _validSource($client, $src);

    switchSource($client, $src);
    $client->showBriefly({ line => [string('SELECT_SOURCE'), $src] });
    $request->setStatusDone();
}

# switchmode cmd for the input the WiiM is on now. App streams (Spotify, AirPlay,
# TIDAL) have no switchmode of their own, so they are not restorable.
sub _sourceCmdFromMode {
    my $mode = shift // '';
    $mode =~ s/\D//g;
    return 'bluetooth' if $mode eq '5' || $mode eq '41';
    return 'line-in'   if $mode eq '4' || $mode eq '40' || $mode eq '60';
    return 'optical'   if $mode eq '6' || $mode eq '43';
    return 'hdmi'      if $mode eq '49';
    return 'wifi'      if $mode eq '10' || $mode eq '0';
    return '';
}

sub _diffuseRememberSource {
    my $wiim = shift || return;
    return unless isWiimPlayer($wiim);
    my $id = $wiim->id() || return;
    return if ref $playerState{$id}{diffuse} eq 'HASH';
    my $mode = $playerState{$id}{mode};
    $mode = '' unless defined $mode;
    my $cmd = _sourceCmdFromMode($mode);
    $playerState{$id}{diffuse} = {
        source_cmd => $cmd,
        mode       => $mode,
        mode_name  => $playerState{$id}{mode_name} || '',
        at         => time(),
    };
    $log->info('Diffusion snapshot ' . ($wiim->name() || $id)
        . " mode=$mode cmd=" . ($cmd ne '' ? $cmd : '-'));
}

sub _relayWiimIdFromUrl {
    my $url = shift || return '';
    return lc($1) if $url =~ m{^wiimrelay://([0-9a-f:]+)}i;
    if ($url =~ m{/plugins/WiimIntegration/relay\.}i && $url =~ /(?:^|[?&])wiim=([^&#]+)/i) {
        my $id = eval { Slim::Utils::Misc::unescape($1, 1) } || $1;
        return lc $id;
    }
    return '';
}

sub _urlIsRelayFor {
    my ($url, $wiim_id) = @_;
    return 0 unless $url && $wiim_id;
    my $id = _relayWiimIdFromUrl($url);
    return $id ne '' && $id eq lc($wiim_id);
}

# Checked only while this destination is actually playing the relay.
sub _destPlayingRelay {
    my ($dest, $wiim_id) = @_;
    return 0 unless $dest && $wiim_id;
    return 0 if eval { $dest->disconnected() };
    return 0 unless eval { $dest->power() };
    return 0 unless eval { $dest->isPlaying() && !$dest->isPaused() };
    return _urlIsRelayFor(_dlnaCurrentUrl($dest), $wiim_id) ? 1 : 0;
}

sub _destHoldingRelay {
    my ($dest, $wiim_id) = @_;
    return 0 unless $dest && $wiim_id;
    return _urlIsRelayFor(_dlnaCurrentUrl($dest), $wiim_id) ? 1 : 0;
}

sub _playlistHasRelay {
    my ($client, $wiim_id) = @_;
    return 0 unless $client && $wiim_id;
    my $count = eval { Slim::Player::Playlist::count($client) } || 0;
    for (my $i = 0; $i < $count; $i++) {
        my $url = eval { Slim::Player::Playlist::url($client, $i) } || '';
        return 1 if _urlIsRelayFor($url, $wiim_id);
    }
    return 0;
}

sub _removeRelayTracks {
    my ($client, $wiim_id) = @_;
    return 0 unless $client && $wiim_id;
    my $count = eval { Slim::Player::Playlist::count($client) } || 0;
    my @drop;
    for (my $i = 0; $i < $count; $i++) {
        my $url = eval { Slim::Player::Playlist::url($client, $i) } || '';
        push @drop, $i if _urlIsRelayFor($url, $wiim_id);
    }
    return 0 unless @drop;
    my $id = $client->id() || '';
    $playerState{$id}{suppress_playlist_hook} = 1 if $id && isWiimPlayer($client);
    for my $i (reverse @drop) {
        eval { Slim::Control::Request::executeRequest($client, ['playlist', 'delete', $i]); };
    }
    delete $playerState{$id}{suppress_playlist_hook} if $id;
    $log->info('Removed relay from ' . ($client->name() || $id) . ' (' . scalar(@drop) . ')');
    return scalar @drop;
}

sub _diffuseSourceChanged {
    my $wiim = shift || return 0;
    my $id = $wiim->id() || return 0;
    my $snap = $playerState{$id}{diffuse};
    return 0 unless ref $snap eq 'HASH' && ($snap->{source_cmd} || '') ne '';
    my $now = _sourceCmdFromMode($playerState{$id}{mode});
    return $snap->{source_cmd} ne $now ? 1 : 0;
}

# List context: destinations that are playing, paused on, or (if asked) queuing this relay.
sub _diffuseActiveDests {
    my ($wiim, $scan_queue) = @_;
    my $wid = lc($wiim && $wiim->id() || '');
    return unless $wid;
    my @out;
    for my $dest (_dlnaCandidates(1)) {
        my $play = _destPlayingRelay($dest, $wid);
        my $hold = $play || _destHoldingRelay($dest, $wid);
        my $queued = ($scan_queue && !$hold && _playlistHasRelay($dest, $wid)) ? 1 : 0;
        next unless $play || $hold || $queued;
        push @out, { client => $dest, play => $play ? 1 : 0 };
    }
    return @out;
}

sub _diffuseForgetIfIdle {
    my $wiim = shift || return;
    my $id = $wiim->id() || return;
    return if _diffuseSourceChanged($wiim);
    return if _diffuseActiveDests($wiim, 1);
    delete $playerState{$id}{diffuse};
}

sub _diffuseReset {
    my $wiim = shift || return;
    return unless isWiimPlayer($wiim);
    my $id = $wiim->id() || return;
    my $wid = lc $id;
    for my $dest (_dlnaCandidates(1)) {
        my $did = lc($dest->id() || '');
        next unless $did;
        my $has = _playlistHasRelay($dest, $wid) || _destHoldingRelay($dest, $wid);
        _removeRelayTracks($dest, $wid) if $has;
        # The target list is the diffusion itself. Clear it even if play has not started.
        _dlnaSetTarget($did, 0) if $has || _dlnaTargetOn($did);
    }
    my $snap = delete $playerState{$id}{diffuse};
    my $saved = (ref $snap eq 'HASH' && $snap->{source_cmd}) ? $snap->{source_cmd} : '';
    my $now = _sourceCmdFromMode($playerState{$id}{mode});
    if ($saved ne '' && $saved ne $now && _validSource($wiim, $saved)) {
        $log->info('Diffusion reset restores ' . ($wiim->name() || $id) . " to $saved");
        switchSource($wiim, $saved);
    }
    elsif ($saved ne '' && $saved ne $now) {
        $log->info('Diffusion reset left ' . ($wiim->name() || $id)
            . " on current source (cannot restore $saved)");
    }
    else {
        $log->info('Diffusion reset on ' . ($wiim->name() || $id));
    }
}

sub _wiimForRelayClient {
    my $client = shift || return;
    my $id = _relayWiimIdFromUrl(_dlnaCurrentUrl($client));
    return _wiimClientById($id) if $id;
    my $count = eval { Slim::Player::Playlist::count($client) } || 0;
    for (my $i = 0; $i < $count; $i++) {
        my $url = eval { Slim::Player::Playlist::url($client, $i) } || '';
        my $found = _relayWiimIdFromUrl($url);
        return _wiimClientById($found) if $found;
    }
    return;
}

sub diffuseCommand {
    my ($request) = @_;
    my $wiim = $request->client();
    return $request->setStatusBadParams() unless $wiim && isWiimPlayer($wiim);
    my $dest_id = lc($request->getParam('_dest') || $request->getRequest(2) || '');
    $dest_id =~ s/\s+//g;
    my $dest;
    for my $cand (_dlnaCandidates(1)) {
        if (lc($cand->id() || '') eq $dest_id) {
            $dest = $cand;
            last;
        }
    }
    return $request->setStatusBadParams() unless $dest;
    my $wid = lc($wiim->id() || '');
    if (_destPlayingRelay($dest, $wid)) {
        _removeRelayTracks($dest, $wid);
        _dlnaSetTarget(lc($dest->id() || ''), 0);
        _diffuseForgetIfIdle($wiim);
        $request->setStatusDone();
        return;
    }
    unless (_playDirectOn($dest, $wiim)) {
        return $request->setStatusBadParams();
    }
    $request->setStatusDone();
}

sub diffuseResetCommand {
    my ($request) = @_;
    my $client = $request->client();
    my $wiim;
    if ($client && isWiimPlayer($client)) {
        $wiim = $client;
    }
    elsif ($client) {
        $wiim = _wiimForRelayClient($client);
    }
    unless ($wiim) {
        $request->setStatusBadParams();
        return;
    }
    _diffuseReset($wiim);
    $request->setStatusDone();
}

sub _annotateDiffuseStatus {
    my ($request, $client) = @_;
    return unless $request && $client;
    my ($role, $source_name, $source_id, $dests) = ('', '', '', '');
    if (isWiimPlayer($client)) {
        my @rows = _diffuseActiveDests($client, 0);
        my @names = map { $_->{client}->name() || $_->{client}->id() } @rows;
        return unless @names || _diffuseSourceChanged($client);
        $role = 'source';
        $source_id = lc($client->id() || '');
        $source_name = $client->name() || '';
        $dests = join(', ', @names);
    }
    else {
        my $url = _dlnaCurrentUrl($client);
        my $wid = _relayWiimIdFromUrl($url);
        return unless $wid;
        my $wiim = _wiimClientById($wid);
        $role = 'dest';
        $source_id = $wid;
        $source_name = $wiim ? ($wiim->name() || $source_id) : $source_id;
        $dests = $client->name() || '';
    }
    $request->addResult('wiim_diffuse', {
        role      => $role,
        source    => $source_name,
        source_id => $source_id,
        dests     => $dests,
    });
}

sub lineoutsQuery {
    my ($request) = @_;
    my $client = $request->client();
    return $request->setStatusBadParams() unless $client && isWiimPlayer($client);

    my $current = _getLineoutMode($client);
    $current =~ s/\D//g if defined $current;
    my $wid = lc($client->id() || '');
    my $to = _menuText($client, 'DLNA_OUTPUT_TO', 'To');
    my @items;
    my $show_reset = _diffuseSourceChanged($client) ? 1 : 0;

    for my $mode (_lineoutModes($client)) {
        my $cmd = $mode->{cmd};
        my $isCurrent = (defined $current && $current ne '' && $cmd eq $current) ? 1 : 0;
        push @items, {
            id         => 'wiim_lineout_' . $cmd,
            text       => $mode->{label} . ($isCurrent ? ' ✓' : ''),
            icon_id    => $mode->{icon_id},
            radio      => $isCurrent,
            nextWindow => 'parent',
            actions    => {
                do => {
                    cmd        => ['wiimintegration', 'lineout', $cmd],
                    player     => 0,
                    nextWindow => 'parent',
                },
            },
        };
    }

    for my $dest (_dlnaCandidates(1)) {
        my $did = lc($dest->id() || '');
        next unless $did;
        my $on = _destPlayingRelay($dest, $wid) ? 1 : 0;
        my $queued = $on || _playlistHasRelay($dest, $wid);
        $show_reset = 1 if $on || $queued;
        my $name = $dest->name() || $did;
        push @items, {
            id         => 'wiim_diffuse_' . $did,
            text       => $to . ' ' . $name . ($on ? ' ✓' : ''),
            icon_id    => 'MTL_svg_stream',
            radio      => $on,
            nextWindow => 'parent',
            actions    => {
                do => {
                    cmd        => ['wiimintegration', 'diffuse', $did],
                    player     => 0,
                    nextWindow => 'parent',
                },
            },
        };
    }

    if ($show_reset) {
        push @items, {
            id         => 'wiim_diffuse_reset',
            text       => _menuText($client, 'DLNA_RESET', 'Stop diffusion'),
            radio      => 0,
            nextWindow => 'parent',
            actions    => {
                do => {
                    cmd        => ['wiimintegration', 'diffusereset'],
                    player     => 0,
                    nextWindow => 'parent',
                },
            },
        };
    }

    _addMenuItems($request, @items);

    # Expose current mode for Material / JSON clients
    $request->addResult('current', $current) if defined $current && $current ne '';
}

sub lineoutCommand {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();
    return $request->setStatusBadParams() unless isWiimPlayer($client);

    my $mode = $request->getParam('_mode') // $request->getRequest(2) // '';
    $mode =~ s/\D//g;
    return $request->setStatusBadParams() unless _validLineout($client, $mode);

    setLineout($client, $mode);
    $client->showBriefly({ line => [string('SELECT_LINEOUT'), _lineoutLabel($mode)] });
    $request->setStatusDone();
}

sub presetCommand {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();
    return $request->setStatusBadParams() unless isWiimPlayer($client);

    my $num = $request->getParam('_num') // $request->getRequest(2) // '';
    $num =~ s/\D//g;
    $num ||= 1;
    playPreset($client, $num);
    $client->showBriefly({ line => [string('SELECT_PRESET'), "Preset $num"] });
    $request->setStatusDone();
}

sub presetClaimCommand {
    my ($request) = @_;
    my $client = $request->client() || return $request->setStatusBadParams();
    return $request->setStatusBadParams() unless isWiimPlayer($client);

    my $num = $request->getParam('_num') // $request->getRequest(2) // '';
    $num =~ s/\D//g;
    return $request->setStatusBadParams() unless $num && $num >= 1 && $num <= 10;

    $request->setStatusProcessing();
    _writePresetBridges($client, 'claim', $num, sub {
        my $res = shift || { ok => 0, error => 'failed' };
        $request->addResult('ok', $res->{ok} ? 1 : 0);
        $request->addResult('written', 0 + ($res->{written} || 0));
        $request->addResult('copied', 1) if $res->{copied};
        $request->addResult('skipped', $res->{skipped}) if $res->{skipped};
        $request->addResult('lms_slot', 0 + $res->{lms_slot}) if $res->{lms_slot};
        $request->addResult('error', $res->{error}) if $res->{error};
        $request->setStatusDone();
    });
}

sub getPresetUrls {
    my $base = _httpBaseUrl();
    my @urls;

    foreach my $client (Slim::Player::Client::clients()) {
        next unless isWiimPlayer($client);
        my $ip = $client->ip() || next;
        $ip =~ s/:\d+$//;
        my $mac = $client->id() || next;
        my @jsonrpc = (
            { label => 'Preset 1',    url => _lmsJsonRpcUrl($mac, ['button', 'preset_1.single']) },
            { label => 'Preset 2',    url => _lmsJsonRpcUrl($mac, ['button', 'preset_2.single']) },
            { label => 'Play',        url => _lmsJsonRpcUrl($mac, ['play']) },
            { label => 'Pause',       url => _lmsJsonRpcUrl($mac, ['pause', '1']) },
            { label => 'Shuffle on',  url => _lmsJsonRpcUrl($mac, ['playlist', 'shuffle', '1']) },
            { label => 'Shuffle off', url => _lmsJsonRpcUrl($mac, ['playlist', 'shuffle', '0']) },
            { label => 'Repeat all',  url => _lmsJsonRpcUrl($mac, ['playlist', 'repeat', '2']) },
            { label => 'Repeat one',  url => _lmsJsonRpcUrl($mac, ['playlist', 'repeat', '1']) },
            { label => 'Repeat off',  url => _lmsJsonRpcUrl($mac, ['playlist', 'repeat', '0']) },
        );
        push @urls, {
            name         => $client->name(),
            ip           => $ip,
            mac          => $mac,
            url          => "$base/preset/1",
            legacy_url   => "$base/preset=1.m3u",
            control_play => "$base/control/play",
            control_pause => "$base/control/pause",
            control_shuffle => "$base/control/shuffle",
            jsonrpc      => \@jsonrpc,
            examples     => [
                "$base/preset/1",
                "$base/preset/2",
                "$base/control/play",
                "$base/playback/toggle",
                "$base/control/pause",
                "$base/control/next",
                "$base/control/prev",
                "$base/control/shuffle",
                "$base/control/source/bluetooth",
                "$base/control/source/line-in",
                "$base/control/source/optical",
                "$base/control/source/wifi",
            ],
        };
    }

    return \@urls;
}

sub apiCall {
    my ($client, $cmd, $cb) = @_;
    my $ip = _wiimHost($client);
    unless ($ip) {
        # Always invoke callback so callers (monitorStatus) can reschedule.
        $cb && $cb->(undef);
        return;
    }
    _apiRequest($ip, $cmd, $cb);
}

sub _apiRequest {
    my ($ip, $cmd, $cb) = @_;
    my $url = "https://$ip/httpapi.asp?command=$cmd";

    my $http = Slim::Networking::SimpleAsyncHTTP->new(
        sub {
            my $response = shift;
            my $data;
            eval { $data = decode_json($response->content) };
            $cb && $cb->($data) if $cb;
        },
        sub {
            my $now = time();
            my $key = "$ip|$cmd";
            if (!$apiWarnAt{$key} || $now - $apiWarnAt{$key} > 120) {
                $apiWarnAt{$key} = $now;
                $log->warn("WiiM API error for $cmd at $ip");
            }
            $cb && $cb->(undef) if $cb;
        },
        { timeout => 4, insecureHTTPS => 1 }
    );
    $http->get($url);
}

1;
