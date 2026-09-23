package Plugins::MaterialSkin::Plugin;

#
# LMS-Material
#
# Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
#
# MIT license.
#

use strict;
use Async::Util;
use Config;
use Encode;
use Scalar::Util qw(blessed);
use Slim::Menu::BrowseLibrary;
use Slim::Music::VirtualLibraries;
use Slim::Utils::Favorites;
use Slim::Utils::Log;
use Slim::Utils::Network;
use Slim::Utils::Prefs;
use Slim::Utils::Strings;
use JSON::XS::VersionOneAndTwo;
use Slim::Utils::Strings qw(string cstring);
use HTTP::Status qw(RC_NOT_FOUND RC_OK);
use File::Basename;
use File::Slurp qw(read_file);
use List::Util qw(shuffle max);
use File::Spec::Functions qw(catdir catfile);
use File::Path qw(make_path);
use Scalar::Util qw(looks_like_number);
use URI::Escape qw(uri_unescape);
use Digest::MD5 qw(md5_hex);

if (!Slim::Web::Pages::Search->can('parseAdvancedSearchParams')) {
    require Plugins::MaterialSkin::Search;
}

my $log = Slim::Utils::Log->addLogCategory({
    'category' => 'plugin.material-skin',
    'defaultLevel' => 'ERROR',
    'description' => 'PLUGIN_MATERIAL_SKIN'
});

*getCurrentPlugins = Slim::Utils::Versions->compareVersions($::VERSION, '9.0.0') < 0
    ? \&Slim::Plugin::Extensions::Plugin::getCurrentPlugins
    : \&Slim::Utils::ExtensionsManager::getCurrentPlugins;

my $prefs = preferences('plugin.material-skin');
my $serverprefs = preferences('server');
my $skinMgr;

my $listOfTranslations = "";
my $haveDarkLogic = 0;
my $osName = "";
my $pluginVersion = "";
my $windowTitle = "";
my $lmsVersion = 0;
my $hideSettings = "";
my $kioskMode = 0;
my $hideForKiosk  = '';
my @listOfRoles = ();

use constant RANDOM_MIX_EXT => '.mix';
use constant NUM_HOME_ITEMS => 10;
use constant PLAYLIST_IMAGE_TRACKS => 20;
use constant MAX_PLAYER_AGE => 14 * 24 * 60 * 60;
# Home context-stats cards only consider listening activity in this window.
# LMS has no monthly play log — lastPlayed within this window is the filter.
use constant CONTEXT_STATS_USAGE_WINDOW => 14 * 24 * 3600; # two weeks (primary)
use constant CONTEXT_STATS_USAGE_WINDOW_FALLBACK => 45 * 24 * 3600; # quiet libraries
use constant CONTEXT_STATS_PODCAST_MAX_AGE => CONTEXT_STATS_USAGE_WINDOW;
# Multi-track albums need this many distinct tracks with playCount>0 to appear.
# One playlist-spillover track must not qualify as "continue listening".
use constant CONTEXT_STATS_ALBUM_MIN_PLAYED_TRACKS => 2;
# Fully-finished albums still surface when this many tracks were touched recently
# (habitual re-listens like a work album that always plays through).
use constant CONTEXT_STATS_ALBUM_MIN_RECENT_COMPLETE => 2;
# Playlists: min distinct member tracks with recent plays (same spillover idea).
# Higher than 1 so a single co-listed hit from an album play cannot invent a
# "playlist you listen to" card.
use constant CONTEXT_STATS_PLAYLIST_MIN_RECENT => 3;

my $LASTFM_API_KEY = '5a854b839b10f8d46e630e8287c2299b';
my $MAX_CACHE_AGE = 90*24*60*60; # 90 days
my $MAX_ADV_SEARCH_RESULTS = 1000;
my $CACHE_MAX_AGE = 60 * 60 * 24 * 31; # 1 month
my $DESKTOP_URL_PARSER_RE = qr{^desktop$}i;
my $MINI_URL_PARSER_RE = qr{^mini$}i;
my $NOW_PLAYING_URL_PARSER_RE = qr{^now-playing$}i;
my $NOW_PLAYING_ONLY_URL_PARSER_RE = qr{^np-only$}i;
my $MOBILE_URL_PARSER_RE = qr{^mobile$}i;
my $SVG_URL_PARSER_RE = qr{material/svg/([a-z0-9-]+)}i;
my $CSS_URL_PARSER_RE = qr{material/customcss/([a-z0-9-]+)}i;
my $JS_URL_PARSER_RE = qr{material/custom.js}i;
my $OTHER_JS_URL_PARSER_RE = qr{material/customjs/([a-z0-9-]+)}i;
my $ACTIONS_URL_PARSER_RE = qr{material/customactions\.json}i;
my $MAIFEST_URL_PARSER_RE = qr{material/material\.webmanifest}i;
my $USER_THEME_URL_PARSER_RE = qr{material/usertheme/.+}i;
my $USER_COLOR_URL_PARSER_RE = qr{material/usercolor/.+}i;
my $DOWNLOAD_PARSER_RE = qr{material/download/.+}i;
my $BACKDROP_URL_PARSER_RE = qr{material/backdrops/.+}i;
my $GENRE_URL_PARSER_RE = qr{material/genres/.+}i;
my $PLAYLIST_URL_PARSER_RE = qr{material/playlists/.+}i;
my $CLIENT_IP_PARSER_RE = qr{material/client-ip}i;

my $DEFAULT_COMPOSER_GENRES = string('PLUGIN_MATERIAL_SKIN_DEFAULT_COMPOSER_GENRES');
my $DEFAULT_CONDUCTOR_GENRES = string('PLUGIN_MATERIAL_SKIN_DEFAULT_CONDUCTOR_GENRES');
my $DEFAULT_BAND_GENRES = string('PLUGIN_MATERIAL_SKIN_DEFAULT_BAND_GENRES');

my @DEFAULT_BROWSE_MODES = ( 'myMusicArtists', 'myMusicArtistsAlbumArtists', 'myMusicArtistsAllArtists', 'myMusicAlbums',
                             'myMusicGenres', 'myMusicYears', 'myMusicNewMusic','myMusicPlaylists', 'myMusicAlbumsVariousArtists' );

my %EXCLUDE_EXTRAS = map { $_ => 1 } ( 'ALARM', 'PLUGIN_CUSTOMBROWSE', 'PLUGIN_IPENG_CUSTOM_BROWSE_MORE', 'PLUGIN_DSTM', 'PLUGIN_TRACKSTAT', 'PLUGIN_DYNAMICPLAYLIST', 'PLUGIN_CDPLAYER' );

my @ADV_SEARCH_OPS = ('album_titlesearch', 'work_titlesearch', 'album_release_type', 'bitrate', 'comments_value', 'contributor_namesearch', 'filesize', 'lyrics', 'me_titlesearch', 'persistent_playcount',
                      'me_subtitle', 'me_discsubtitle', 'persistent_rating', 'samplerate', 'samplesize', 'secs', 'timestamp', 'tracknum', 'url', 'year' );
my @ADV_SEARCH_OTHER = ('content_type', 'contributor_namesearch.active1', 'contributor_namesearch.active2', 'contributor_namesearch.active3', 'contributor_namesearch.active4',
                        'contributor_namesearch.active5', 'genre', 'genre_name' );

my %IGNORE_PROTOCOLS = map { $_ => 1 } ('mms', 'file', 'tmp', 'http', 'https', 'spdr', 'icy', 'teststream', 'db', 'playlist');

my %RADIO_PROTOCOLS = map { $_ => 1 } ('http', 'https', 'accur', 'cplus', 'globalplayer', 'newsuk', 'pr', 'radioparadise', 'rnp', 'sounds', 'times', 'virgin', 'sxm');

my @BOOL_OPTS = ('allowDownload', 'playShuffle', 'touchLinks', 'showAllArtists', 'artistFirst', 'yearInSub', 'showComment', 'genreImages', 'playlistImages', 'maiComposer', 'showConductor', 'showBand', 'showArtistWorks', 'combineAppsAndRadio', 'useGrouping', 'setPlayerLibrary');

my %ROLE_ICON_MAP = (
    'bass' => 'bassist',
    'cello' => 'cellist',
    'choirmaster' => 'conductor',
    'concertmaster' => 'conductor',
    'director' => 'conductor',
    'drums' => 'drummer',
    'flute' => 'flutist',
    'guitar' => 'guitarist',
    'harpsichord' => 'pianist',
    'harpsichordist' => 'pianist',
    'keyboards' => 'keyboardist',
    'keyboard' => 'keyboardist',
    'organ' => 'keyboardist',
    'organist' => 'keyboardist',
    'piano' => 'pianist',
    'saxophone' => 'saxophonist',
    'singer' => 'vocalist',
    'songwriter' => 'composer',
    'trombone' => 'trombonist',
    'trumpet' => 'trumpeter',
    'viola' => 'violinist',
    'violist' => 'violinist',
    'violin' => 'violinist',
    'vocals' => 'vocalist',
    'moods' => 'mood',
    'themes' => 'theme'
);

# Taken from https://github.com/LMS-Community/lms-plugin-repository/blob/master/buildrepo.pl
my $CATEGORIES_MAP = {
    'Accuradio' => 'radio',
    'ArchiveOrg' => 'musicservices',
    'ARDAudiothek' => 'radio',
    'BBCSounds' => 'radio',
    'CBCCanadaFrancais' => 'radio',
    'CPlus' => 'radio',
    'FranceTV' => 'radio',
    'GlobalPlayerUK' => 'radio',
    'iHeartRadio' => 'radio',
    'LCI' => 'radio',
    'Live365' => 'radio',
    'MixCloud' => 'musicservices',
    'MyQobuz' => 'musicservices',
    'Pyrrha' => 'musicservices',
    'PlanetRadio' => 'radio',
    'PodcastExt' => 'musicservices',
    'RadioFavourites' => 'radio',
    'RadioFeedsSBS' => 'radio',
    'RadioFrance' => 'radio',
    'RadioNet' => 'radio',
    'RadioNowPlaying' => 'radio',
    'SqueezeCloud' => 'musicservices',
    'TIDAL' => 'musicservices',
    'TimesRadio' => 'radio',
    'VirginRadio' => 'radio',
    'Wefunk' => 'radio',
    'YouTube' => 'musicservices'
};

my $HOME_EXTRAS = {};

sub initPlugin {
    my $class = shift;

    if (Slim::Utils::Versions->compareVersions($::VERSION, '9.0.1')<0) {
        if (my $composergenres = $prefs->get('composergenres')) {
            $prefs->set('composergenres', $DEFAULT_COMPOSER_GENRES) if $composergenres eq '';
        } else {
            $prefs->set('composergenres', $DEFAULT_COMPOSER_GENRES);
        }

        if (my $conductorgenres = $prefs->get('conductorgenres')) {
            $prefs->set('conductorgenres', $DEFAULT_CONDUCTOR_GENRES) if $conductorgenres eq '';
        } else {
            $prefs->set('conductorgenres', $DEFAULT_CONDUCTOR_GENRES);
        }

        if (my $bandgenres = $prefs->get('bandgenres')) {
            $prefs->set('bandgenres', $DEFAULT_BAND_GENRES) if $bandgenres eq '';
        } else {
            $prefs->set('bandgenres', $DEFAULT_BAND_GENRES);
        }
    }

    # 4.2.2 changed bool opts to be 'on', revert this to '1'/'0'
    foreach my $p (@BOOL_OPTS) {
        if (my $v = $prefs->get($p)) {
            if ($v eq 'on') {
                $prefs->set($p, '1');
            }
        }
    }

    if (Slim::Utils::Versions->compareVersions($::VERSION, '9.0.1')<0) {
        $prefs->init({
            composergenres => $DEFAULT_COMPOSER_GENRES,
            conductorgenres => $DEFAULT_CONDUCTOR_GENRES,
            bandgenres => $DEFAULT_BAND_GENRES,
            maiComposer => 0,
            showComposer => 1,
            showConductor => 0,
            showBand => 0,
            showArtistWorks => 1,
            respectFixedVol => 1,
            showAllArtists => 1,
            artistFirst => 1,
            password => '',
            allowDownload => 0,
            commentAsDiscTitle => 0,
            showComment => 0,
            pagedBatchSize => $lmsVersion>=80400 ? 250 : 100,
            noArtistFilter => 1,
            releaseTypeOrder => '',
            genreImages => 0,
            playlistImages => 1,
            touchLinks => 0,
            yearInSub => 1,
            playShuffle => 0,
            combineAppsAndRadio => 0,
            hideApps => '',
            hideExtras => '',
            hidePlayers => '',
            screensaverTimeout => 60,
            npSwitchTimeout => 5*60,
            useDefaultForSettings => 0,
            useGrouping => 1,
            setPlayerLibrary => 0,
            # Context Stats home cards + local session history (server-wide, not per-client UI)
            contextStatsHome => 1,
            sessionEnhance => 0
        });
    } else {
        $prefs->init({
            maiComposer => 0,
            showComposer => 1,
            showConductor => 0,
            showBand => 0,
            showArtistWorks => 1,
            respectFixedVol => 1,
            showAllArtists => 1,
            artistFirst => 1,
            password => '',
            allowDownload => 0,
            commentAsDiscTitle => 0,
            showComment => 0,
            pagedBatchSize => $lmsVersion>=80400 ? 250 : 100,
            noArtistFilter => 1,
            releaseTypeOrder => '',
            genreImages => 0,
            playlistImages => 1,
            touchLinks => 0,
            yearInSub => 1,
            playShuffle => 0,
            combineAppsAndRadio => 0,
            hideApps => '',
            hideExtras => '',
            hidePlayers => '',
            screensaverTimeout => 60,
            npSwitchTimeout => 5*60,
            useDefaultForSettings => 0,
            useGrouping => 1,
            setPlayerLibrary => 0,
            contextStatsHome => 1,
            sessionEnhance => 0
        });
    }
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'maiComposer');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'showBand');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'showComposer');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'showConductor');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'showArtistWorks');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'respectFixedVol');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'showAllArtists');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'artistFirst');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'noArtistFilter');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'yearInSub');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'touchLinks');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'showComment');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'genreImages');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'playlistImages');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'allowDownload');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'useDefaultForSettings');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless defined $_[1]; }, 'useGrouping');
    $prefs->setChange(sub { $prefs->set($_[0], 0) unless $_[1]; }, 'setPlayerLibrary');
    # Coerce undef (LMS unchecked checkbox POST) to 0 — do not treat valid 0 as "missing"
    $prefs->setChange(sub {
        my ($pref, $new) = @_;
        if (!defined $new) {
            $prefs->set($pref, 0);
        }
    }, 'contextStatsHome', 'sessionEnhance');


    if (main::WEBUI) {
        require Plugins::MaterialSkin::Settings;
        Plugins::MaterialSkin::Settings->new();

        Slim::Web::Pages->addPageFunction( $DESKTOP_URL_PARSER_RE, sub {
            my ($client, $params) = @_;
            return Slim::Web::HTTP::filltemplatefile('desktop.html', $params);
        } );
        Slim::Web::Pages->addPageFunction( $MINI_URL_PARSER_RE, sub {
            my ($client, $params) = @_;
            return Slim::Web::HTTP::filltemplatefile('mini.html', $params);
        } );
        Slim::Web::Pages->addPageFunction( $NOW_PLAYING_URL_PARSER_RE, sub {
            my ($client, $params) = @_;
            return Slim::Web::HTTP::filltemplatefile('now-playing.html', $params);
        } );
        Slim::Web::Pages->addPageFunction( $NOW_PLAYING_ONLY_URL_PARSER_RE, sub {
            my ($client, $params) = @_;
            return Slim::Web::HTTP::filltemplatefile('np-only.html', $params);
        } );
        Slim::Web::Pages->addPageFunction( $MOBILE_URL_PARSER_RE, sub {
            my ($client, $params) = @_;
            return Slim::Web::HTTP::filltemplatefile('mobile.html', $params);
        } );

        Slim::Web::Pages->addRawFunction($SVG_URL_PARSER_RE, \&_svgHandler);
        Slim::Web::Pages->addRawFunction($CSS_URL_PARSER_RE, \&_customCssHandler);
        Slim::Web::Pages->addRawFunction($JS_URL_PARSER_RE, \&_customJsHandler);
        Slim::Web::Pages->addRawFunction($OTHER_JS_URL_PARSER_RE, \&_customJsHandler);
        Slim::Web::Pages->addRawFunction($ACTIONS_URL_PARSER_RE, \&_customActionsHandler);
        Slim::Web::Pages->addRawFunction($MAIFEST_URL_PARSER_RE, \&_manifestHandler);
        Slim::Web::Pages->addRawFunction($USER_THEME_URL_PARSER_RE, \&_userThemeHandler);
        Slim::Web::Pages->addRawFunction($USER_COLOR_URL_PARSER_RE, \&_userColorHandler);
        Slim::Web::Pages->addRawFunction($DOWNLOAD_PARSER_RE, \&_downloadHandler);
        Slim::Web::Pages->addRawFunction($BACKDROP_URL_PARSER_RE, \&_backdropHandler);
        Slim::Web::Pages->addRawFunction($GENRE_URL_PARSER_RE, \&_genreHandler);
        Slim::Web::Pages->addRawFunction($PLAYLIST_URL_PARSER_RE, \&_playlistHandler);
        Slim::Web::Pages->addRawFunction($CLIENT_IP_PARSER_RE, \&_clientIpHandler);
        # make sure scanner does pre-cache artwork in the size the skin is using in browse modesl
        Slim::Control::Request::executeRequest(undef, [ 'artworkspec', 'add', '300x300_f', 'Material Skin (Grid)' ]);
        Slim::Control::Request::executeRequest(undef, [ 'artworkspec', 'add', '150x150_f', 'Material Skin (List)' ]);
        if ($serverprefs->get('precacheHiDPIArtwork')) {
            Slim::Control::Request::executeRequest(undef, [ 'artworkspec', 'add', '600x600_f', 'Material Skin (Grid, HiDPI)' ]);
        }

        $skinMgr = Slim::Web::HTTP::getSkinManager();
    }

    $class->initCLI();
    $class->initTranslationList();
    $class->initRoleList();
    $class->initOthers();
    if (Slim::Utils::Versions->compareVersions($::VERSION, '8.4.0') < 0) {
        Slim::Utils::Timers::setTimer(undef, Time::HiRes::time() + 15, \&_checkUpdates);
    }
    Slim::Control::Request::subscribe(\&_playQueueCleared, [['playlist'], ['clear']]);
    Slim::Control::Request::subscribe(\&_materialPresetButton, [['button']]);
    # Hardware Boom / Squeezebox keys call playPreset via IR executeButton,
    # not the CLI `button` command — wrap that function so shuffle/repeat apply.
    Slim::Control::Request::subscribe(\&_materialPlaylistAfterPreset, [['playlist'], ['play', 'loadtracks', 'playtracks', 'addtracks']]);
    _materialWrapPlayPreset();
    # Local Context Stats session log (opt-in via sessionEnhance pref)
    eval {
        require Plugins::MaterialSkin::SessionLog;
        Plugins::MaterialSkin::SessionLog::init();
        1;
    } or do {
        $log->error("SessionLog init failed: $@");
    };
}

sub shutdownPlugin {
    Slim::Control::Request::unsubscribe(\&_playQueueCleared);
    Slim::Control::Request::unsubscribe(\&_materialPresetButton);
    Slim::Control::Request::unsubscribe(\&_materialPlaylistAfterPreset);
    eval { Plugins::MaterialSkin::SessionLog::shutdown(); };
}

sub getPluginVersion {
    return $pluginVersion;
}

sub getLmsVersion {
    return $lmsVersion;
}

sub getWindowTitle {
    return $windowTitle;
}

sub getHideSettings {
    return $hideSettings;
}

sub getKioskMode {
    return $kioskMode;
}

sub getHideForKiosk {
    return $hideForKiosk;
}

sub getSkinLanguages {
    return $listOfTranslations;
}

sub getHaveDarkLogic {
    return $haveDarkLogic;
}

sub readIntPref {
    my $class = shift;
    my $scope = shift;
    my $key = shift;
    my $val = shift;
    my $prfs = $scope eq "server" ? $serverprefs : preferences($scope);
    my $prefval = $prfs->get($key);
    if (!defined $prefval) {
        return $val;
    }
    if ($prefval eq '?') {
        return $val;
    }
    eval { $val = int($prefval); };
    return $val;
}

sub readStringPref {
    my $class = shift;
    my $scope = shift;
    my $key = shift;
    my $def = shift;
    my $prfs = $scope eq "server" ? $serverprefs : preferences($scope);
    my $prefval = $prfs->get($key);
    if (!defined $prefval) {
        return $def;
    }
    if ($prefval eq "") {
        return $def;
    }
    return $prefval;
}

sub getOsName {
    return $osName;
}

sub initCLI {
    #                                                                      |requires Client
    #                                                                      |  |is a Query
    #                                                                      |  |  |has Tags
    #                                                                      |  |  |  |Function to call
    #                                                                      C  Q  T  F
    Slim::Control::Request::addDispatch(['material-skin', '_cmd'],        [0, 0, 1, \&_cliCommand]);
    Slim::Control::Request::addDispatch(['material-skin-client', '_cmd'], [1, 0, 1, \&_cliClientCommand]);
    Slim::Control::Request::addDispatch(['material-skin-group', '_cmd'],  [1, 0, 1, \&_cliGroupCommand]);
    Slim::Control::Request::addDispatch(['material-skin-query', '_cmd', '_index', '_quantity'], [0, 1, 1, \&_cliCommandQuery]);

    # Notification
    Slim::Control::Request::addDispatch(['material-skin', 'notification', '_type', '_msg'], [0, 0, 0, undef]);

    # SqueezeDSP ships setvalCommand but forgets to register it — needed for NP-bar presets.
    # Safe no-op if SqueezeDSP is not installed.
    eval {
        require Plugins::SqueezeDSP::UI_Functions;
        Slim::Control::Request::addDispatch(
            ['squeezedsp.setval'],
            [1, 1, 1, \&Plugins::SqueezeDSP::UI_Functions::setvalCommand]
        );
        1;
    };
}

sub initTranslationList() {
    my $dir = dirname(__FILE__) . "/HTML/material/html/lang/";

    opendir(DIR, $dir);
    my @files = grep(/\.json$/,readdir(DIR));
    closedir(DIR);

    my @trans = ();
    foreach my $file (@files) {
        $file =~ s/\.[^.]+$//;
        if ($file ne 'blank') {
            push(@trans, "'$file'");
        }
    }
    $listOfTranslations = join(',', @trans);
}

sub initRoleList() {
    my $dir = dirname(__FILE__) . "/HTML/material/html/images/";

    opendir(DIR, $dir);
    my @paths = grep(/\.svg$/,readdir(DIR));
    closedir(DIR);
    foreach my $path (@paths) {
        my $fname = basename($path);
        if (rindex($fname, "role-")==0) {
            $fname = substr($fname, 5, length($fname)-9);
            if (length($fname)>2) {
                push(@listOfRoles, $fname);
            }
        }
    }

    # @listOfRoles is used to provide role icons by seeing if request
    # has text of role - so want largest strings first.
    @listOfRoles = sort { length($a) <=> length($b) } @listOfRoles;
    @listOfRoles = reverse(@listOfRoles);
}

sub initOthers {
    my ($class) = @_;

    my %skins = Slim::Web::HTTP::skins();
    $haveDarkLogic = $skins{DARKLOGIC} ? 1 : 0;

    $osName = Slim::Utils::OSDetect::details()->{'osName'};

    $pluginVersion = Slim::Utils::PluginManager->dataForPlugin($class)->{version};

    if ($pluginVersion eq 'DEVELOPMENT') {
        # Try to get the git revision from which we're running
        if (my ($skinDir) = grep /MaterialSkin/, @{Slim::Web::HTTP::getSkinManager()->_getSkinDirs() || []}) {
            my $revision = `cd $skinDir && git show -s --format=%h\\|%ci 2> /dev/null`;
            if ($revision =~ /^([0-9a-f]+)\|(\d{4}-\d\d-\d\d.*)/i) {
                $pluginVersion = 'GIT-' . $1;
            }
        }
    }

    if ($pluginVersion eq 'DEVELOPMENT') {
        use POSIX qw(strftime);
        my $datestring = strftime("%Y-%m-%d-%H-%M-%S", localtime);
        $pluginVersion = "DEV-${datestring}";
    }

    $windowTitle = $prefs->get('windowTitle');
    if (!$windowTitle || $windowTitle eq '') {
        $windowTitle = 'Lyrion Music Server';
    }

    my @parts = split /\./, $::VERSION;
    foreach my $p (@parts) {
        $lmsVersion *= 100;
        $lmsVersion += int($p);
    }

    $hideSettings = $prefs->get('hideSettings');
    if (!$hideSettings) {
        $hideSettings = '';
    }

    my $mode = $prefs->get('kioskMode');
    if (!$mode || $mode eq '') {
        $kioskMode = 0;
    } else {
        $kioskMode = int($mode);
    }

    $hideForKiosk = $prefs->get('hideForKiosk');
    if (!$hideForKiosk) {
        $hideForKiosk = '9, 10, 11, 12, 13, 14, 15, 16, 20, 25, 26, 27, 29, 30, 41, 42, 49, 50, 56, 57';
    }
}

sub registerHomeExtra {
    my ($class, $id, $args) = @_;

    if (!($id && $args->{title} && $args->{handler})) {
        $log->error("Missing details for Home Extra with id '$id': " . Data::Dump::dump($args));
        return;
    }

    $log->warn("Home Extra with id '$id' is already registered - overwriting") if $HOME_EXTRAS->{$id};

    my $extras = { id => $id };
    foreach (keys %$args) { $extras->{$_} = $args->{$_} }

    $HOME_EXTRAS->{'3rdparty_' . $id} = $extras;
}

sub getHomeExtra {
    # prefix identifiers to not conflict with built-in extras
    return $HOME_EXTRAS->{'3rdparty_' . $_[0]};
}

sub getHomExtrasIDs {
    return map { s/^3rdparty_//; $_ } keys %$HOME_EXTRAS;
}

sub getHomeExtra3rdPartyItems {
    return to_json([ map {
        my $item = $HOME_EXTRAS->{$_};
        {
            id          => $_,
            title       => Slim::Utils::Strings::getString($item->{title}),
            subtitle    => Slim::Utils::Strings::getString($item->{subtitle}),
            icon        => $item->{icon},
            needsPlayer => $item->{needsPlayer}
        }
    } keys %$HOME_EXTRAS ]);
}

sub setHomeExtraTitle {
    my ($class, $id, $title) = @_;
    if (my $extra = $HOME_EXTRAS->{'3rdparty_' . $id}) {
        $extra->{title} = $title;
        signalHomeExtraUpdate();
    }
}

sub signalHomeExtraUpdate {
    Slim::Control::Request::notifyFromArray(undef, ['material-skin', 'notification', 'internal', 'refresh-home']);
}

#sub _checkPlayQueue {
#    my $request = shift;
#    if (!$prefs->get('playShuffle')) {
#        return;
#    }
#    main::INFOLOG && $log->is_info && $log->info("Check queue");
#    my $client = $request->client();
#    if (0==Slim::Player::Playlist::count($client) && 0!=Slim::Player::Playlist::shuffle($client)) {
#        Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 2.00, sub {
#            if (0==Slim::Player::Playlist::count($client) && 0!=Slim::Player::Playlist::shuffle($client)) {
#                main::INFOLOG && $log->is_info && $log->info("Set queue to not shuffled");
#                $client->execute(['playlist', 'shuffle', 0]);
#            }
#        });
#    }
#}

sub _playQueueCleared {
    my $request = shift;
    my $client  = $request->client();
    if (!$client || !$prefs->get('setPlayerLibrary')) {
        return;
    }

    my $prevLib = $prefs->client($client)->get('libraryId');
    if ($prevLib) {
        my $currentLib = $serverprefs->client($client)->get('libraryId');
        if ($currentLib ne $prevLib) {
            main::DEBUGLOG && $log->debug("Restore lib id ${prevLib}");
            $serverprefs->client($client)->set('libraryId', $prevLib);
            $serverprefs->client($client)->remove('libraryId') unless $prevLib;
            Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 0.1, sub {Slim::Schema->totals($client);});
        }
        $prefs->client($client)->remove('libraryId');
    }
}

my $_origPlayPreset;
my %presetPlayMode; # id => { shuffle, repeat, until } — Client is an ARRAY accessor, not a hash

sub _materialPlayer {
    my $c = shift || return;
    if (!blessed($c) || !$c->can('id')) {
        $c = eval { Slim::Player::Client::getClient($c) } || return;
    }
    return unless blessed($c) && $c->can('id');
    return $c;
}

sub _materialWrapPlayPreset {
    return if $_origPlayPreset;
    $_origPlayPreset = $Slim::Buttons::Common::functions{'playPreset'};
    return unless $_origPlayPreset && ref $_origPlayPreset eq 'CODE';
    Slim::Buttons::Common::setFunction('playPreset', \&_materialPlayPreset);
}

sub _materialPlayPreset {
    my ($client, $button, $digit) = @_;
    my $p = _materialPlayer($client);
    if ($p && defined $digit && $digit =~ /^\d+$/) {
        my $num = 0 + $digit;
        $num = 10 if $num == 0;
        _materialApplyPresetPlayMode($p, $num);
    }
    return $_origPlayPreset->($client, $button, $digit);
}

sub _materialPresetButton {
    my $request = shift;
    my $client  = _materialPlayer($request && $request->can('client') ? $request->client() : undef) || return;
    my $btn = $request->getParam('_buttoncode') || $request->getRequest(1) || '';
    return unless $btn =~ /^(?:preset_|playPreset_)(\d+)/i;
    _materialApplyPresetPlayMode($client, $1);
}

sub _materialPlaylistAfterPreset {
    my $request = shift;
    my $client  = _materialPlayer($request && $request->can('client') ? $request->client() : undef) || return;
    my $id = $client->id() || return;
    my $st = $presetPlayMode{$id} || return;
    return unless $st->{until} && Time::HiRes::time() < $st->{until};
    Slim::Utils::Timers::killTimers($client, \&_materialApplyPresetPlayModeTick);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 0.2, \&_materialApplyPresetPlayModeTick, $client);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 1.5, \&_materialApplyPresetPlayModeTick, $client);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 4.0, \&_materialApplyPresetPlayModeTick, $client);
}

sub _materialApplyPresetPlayMode {
    my ($client, $num) = @_;
    $client = _materialPlayer($client) || return;
    return unless $num;
    $num = 0 + $num;
    return if $num < 1 || $num > 10;
    my $presets = eval { $serverprefs->client($client)->get('presets') } || [];
    $presets = [] unless ref $presets eq 'ARRAY';
    my $p = $presets->[$num - 1] || {};
    $p = {} unless ref $p eq 'HASH';
    my $shuffle = 0 + ($p->{shuffle} // 0);
    my $repeat  = 0 + ($p->{repeat}  // 0);
    $shuffle = 0 if $shuffle !~ /^[012]$/;
    $repeat  = 0 if $repeat  !~ /^[012]$/;
    Slim::Utils::Timers::killTimers($client, \&_materialApplyPresetPlayModeTick);
    $presetPlayMode{$client->id()} = {
        shuffle => $shuffle,
        repeat  => $repeat,
        until   => Time::HiRes::time() + 15,
    };
    # Pref first so playlist play/XMLBrowser loads already in this mode.
    # Delayed execute reshuffles the new queue (don't shuffle the old one now).
    eval { $serverprefs->client($client)->set('shuffle', $shuffle) };
    eval { $serverprefs->client($client)->set('repeat', $repeat) };
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 0.8, \&_materialApplyPresetPlayModeTick, $client);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 2.2, \&_materialApplyPresetPlayModeTick, $client);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 5.0, \&_materialApplyPresetPlayModeTick, $client);
    Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 9.0, \&_materialApplyPresetPlayModeTick, $client);
}

sub _materialApplyPresetPlayModeTick {
    my $client = _materialPlayer($_[0]) || _materialPlayer($_[1]) || return;
    my $id = $client->id() || return;
    my $st = $presetPlayMode{$id} || return;
    my $shuffle = $st->{shuffle};
    my $repeat  = $st->{repeat};
    my $target = $client;
    eval {
        if ($client->controller && $client->controller->can('master')) {
            my $master = $client->controller->master();
            $target = $master if $master;
        }
    };
    eval { Slim::Control::Request::executeRequest($target, ['playlist', 'shuffle', $shuffle]) } if defined $shuffle;
    eval { Slim::Control::Request::executeRequest($target, ['playlist', 'repeat', $repeat]) } if defined $repeat;
}

sub _getUrlQueryParam {
    my $uri = shift;
    my $key = shift;
    my $start = index($uri, $key . "=");

    if ($start > 0) {
        $start += length($key)+1;
        my $end = index($uri, "&", $start);
        if ($end == $start) {
            return undef;
        }
        if ($end > $start) {
            return substr($uri, $start, $end-$start);
        }
        return substr($uri, $start);
    }
    return undef;
}

sub _fetchDbVal {
    my $dbh = shift;
    my $query = shift;
    my $key = shift;
    my $col = shift;
    $key = [split(/,/,$key)] if !ref $key;
    if ($key) {
        my $sql = $dbh->prepare_cached( $query );
        $sql->execute(uri_unescape(@{$key}));
        if ( my $result = $sql->fetchall_arrayref({}) ) {
            return $result->[0]->{$col} if ref $result && scalar @$result;
        }
    }
    return undef;
}

sub _startsWith {
    return substr($_[0], 0, length($_[1])) eq $_[1];
}

sub _namesort {
    my $param = shift;
    return !$param || !$param->namesort ? "" : lc($param->namesort);
}

sub _albumartistsort {
    my $param = shift;
    return !$param || !$param->contributor ? "" : _namesort($param->contributor);
}

sub _sortTracks {
    my $tracksRef = shift;
    my $order = shift;
    my @tracks = @$tracksRef;
    my $singleField = 0;
    if ($order>=100) {
        $order -= 100;
        $singleField = 1;
    }

    # 0: Reverse
    # 1: Shuffle
    # 2: AlbumArtist (Album, Disc No, Track No)
    # 3: Artist (Album, Disc No, Track No)
    # 4: Album (Album Artist (Disc No, Track No)
    # 5: Title (Album Artist, Album, Disc No, Track No)
    # 6: Genre (Album Artist, Album (Disc No, Track No)
    # 7: Year (Album Artist, Album (Disc No, Track No)
    # 8: Composer (Album, Disc No, Track No)
    # 9: Conductor (Album, Disc No, Track No)
    # 10: Band (Album, Disc No, Track No)
    # 11: Date Added (Album Artist, Album (Disc No, Track No)
    # 12: Date Last Played (Album Artist, Album (Disc No, Track No)
    # 13: Rating (Album Artist, Album, Disc No, Track No)
    # 14: Play Count (Album Artist, Album (Disc No, Track No)
    if (0==$order) {
        @tracks = reverse(@tracks);
    } elsif (1==$order) {
        @tracks = shuffle(shuffle(@tracks));
    } elsif (2==$order) {
        @tracks = $singleField ? sort {_albumartistsort($a->album) cmp _albumartistsort($b->album)} @tracks : sort {_albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (3==$order) {
        @tracks = $singleField ? sort {_namesort($a->artist) cmp _namesort($b->artist)} @tracks : sort {_namesort($a->artist) cmp _namesort($b->artist) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (4==$order) {
        @tracks = $singleField ? sort {_namesort($a->album) cmp _namesort($b->album)} @tracks : sort {_namesort($a->album) cmp _namesort($b->album) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (5==$order) {
        @tracks = $singleField ? sort {lc($a->titlesort) cmp lc($b->titlesort)} @tracks : sort {lc($a->titlesort) cmp lc($b->titlesort) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (6==$order) {
        @tracks = $singleField ? sort {_namesort($a->genre) cmp _namesort($b->genre)} @tracks : sort {_namesort($a->genre) cmp _namesort($b->genre) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (7==$order) {
        @tracks = $singleField ? sort {($a->year || 0) <=> ($b->year || 0)} @tracks : sort {($a->year || 0) <=> ($b->year || 0) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (8==$order) {
        @tracks = $singleField ? sort {_namesort($a->composer) cmp _namesort($b->composer)} @tracks : sort {_namesort($a->composer) cmp _namesort($b->composer) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (9==$order) {
        @tracks = $singleField ? sort {_namesort($a->conductor) cmp _namesort($b->conductor)} @tracks : sort {_namesort($a->conductor) cmp _namesort($b->conductor) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (10==$order) {
        @tracks = $singleField ? sort {_namesort($a->band) cmp _namesort($b->band)} @tracks : sort {_namesort($a->band) cmp _namesort($b->band) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (11==$order) {
        @tracks = $singleField ? sort {($a->addedTime || 0) <=> ($b->addedTime || 0)} @tracks : sort {($a->addedTime || 0) <=> ($b->addedTime || 0) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (12==$order) {
        @tracks = $singleField ? sort {($b->lastplayed || 0) <=> ($a->lastplayed || 0)} @tracks : sort {($b->lastplayed || 0) <=> ($a->lastplayed || 0) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (13==$order) {
        @tracks = $singleField ? sort {($a->rating || 0) <=> ($b->rating || 0)} @tracks : sort {($a->rating || 0) <=> ($b->rating || 0) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    } elsif (14==$order) {
        @tracks = $singleField ? sort {($b->playcount || 0) <=> ($a->playcount || 0)} @tracks : sort {($b->playcount || 0) <=> ($a->playcount || 0) || _albumartistsort($a->album) cmp _albumartistsort($b->album) || _namesort($a->album) cmp _namesort($b->album) || ($a->disc || 0) <=> ($b->disc || 0) || ($a->tracknum || 0) <=> ($b->tracknum || 0)} @tracks;
    }
    return @tracks;
}

sub _releaseTypeName {
    my ($releaseType, $suffix) = @_;

    my $nameToken = uc($releaseType);
    $nameToken =~ s/[^a-z_0-9]/_/ig;
    my $name;
    foreach ('RELEASE_TYPE_' . $nameToken . $suffix, 'RELEASE_TYPE_CUSTOM_' . $nameToken, $nameToken . $suffix) {
        $name = string($_) if Slim::Utils::Strings::stringExists($_);
        last if $name;
    }
    return $name || $releaseType;
}

sub _cliCommand {
    my $request = shift;

    # check this is the correct query.
    if ($request->isNotCommand([['material-skin']])) {
        $request->setStatusBadDispatch();
        return;
    }

    my $cmd = $request->getParam('_cmd');
    #main::DEBUGLOG && $log->debug("command: ${cmd}");
    if ($request->paramUndefinedOrNotOneOf($cmd, ['prefs', 'info', 'transferqueue', 'delete-favorite', 'map', 'resolve', 'delete-podcast',
                                                  'plugins', 'plugins-manage', 'plugins-catalog', 'plugins-settings', 'plugins-settings-set',
                                                  'plugin-install', 'plugin-enabled', 'plugins-status', 'plugins-update', 'extras', 'delete-vlib', 'pass-isset',
                                                  'pass-check', 'browsemodes', 'geturl', 'command', 'scantypes', 'server', 'themes',
                                                  'playersettings', 'activeplayers', 'urls', 'adv-search', 'adv-search-params', 'protocols',
                                                  'players-extra-info', 'sort-playlist', 'mixer', 'release-types', 'check-for-updates',
                                                  'similar', 'apps', 'rndmix', 'scan-progress', 'send-notif', 'home-extra',
                                                  'home-extra-3rdparty', 'context-stats-home', 'player-list',
                                                  'sessions-prefs', 'sessions-clear', 'sessions-context',
                                                  'player-presets', 'player-presets-set']) ) {
        $request->setStatusBadParams();
        return;
    }

    if ($cmd eq 'prefs') {
        if (Slim::Utils::Versions->compareVersions($::VERSION, '9.0.1')<0) {
            $request->addResult('composergenres', $prefs->get('composergenres'));
            $request->addResult('conductorgenres', $prefs->get('conductorgenres'));
            $request->addResult('bandgenres', $prefs->get('bandgenres'));
        }
        $request->addResult('maiComposer', $prefs->get('maiComposer'));
        $request->addResult('showComposer', $prefs->get('showComposer'));
        $request->addResult('showConductor', $prefs->get('showConductor'));
        $request->addResult('showBand', $prefs->get('showBand'));
        $request->addResult('showArtistWorks', $prefs->get('showArtistWorks'));
        $request->addResult('respectFixedVol', $prefs->get('respectFixedVol'));
        $request->addResult('showAllArtists', $prefs->get('showAllArtists'));
        $request->addResult('artistFirst', $prefs->get('artistFirst'));
        $request->addResult('allowDownload', $prefs->get('allowDownload'));
        $request->addResult('commentAsDiscTitle', $prefs->get('commentAsDiscTitle'));
        $request->addResult('showComment', $prefs->get('showComment'));
        $request->addResult('pagedBatchSize', $prefs->get('pagedBatchSize'));
        $request->addResult('noArtistFilter', $prefs->get('noArtistFilter'));
        $request->addResult('releaseTypeOrder', uc($prefs->get('releaseTypeOrder')));
        $request->addResult('genreImages', $prefs->get('genreImages'));
        $request->addResult('playlistImages', $prefs->get('playlistImages'));
        $request->addResult('touchLinks', $prefs->get('touchLinks'));
        $request->addResult('yearInSub', $prefs->get('yearInSub'));
        $request->addResult('playShuffle', $prefs->get('playShuffle'));
        $request->addResult('combineAppsAndRadio', $prefs->get('combineAppsAndRadio'));
        $request->addResult('hidePlayers', $prefs->get('hidePlayers'));
        $request->addResult('screensaverTimeout', $prefs->get('screensaverTimeout'));
        $request->addResult('npSwitchTimeout', $prefs->get('npSwitchTimeout'));
        $request->addResult('useDefaultForSettings', $prefs->get('useDefaultForSettings'));
        $request->addResult('useGrouping', $prefs->get('useGrouping'));
        $request->addResult('setPlayerLibrary', $prefs->get('setPlayerLibrary'));
        # Context Stats — server-wide (configured in Material Skin plugin settings, not client UI)
        $request->addResult('contextStatsHome', $prefs->get('contextStatsHome') ? 1 : 0);
        $request->addResult('sessionEnhance', $prefs->get('sessionEnhance') ? 1 : 0);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'info') {
        my $osDetails = Slim::Utils::OSDetect::details();
        $request->addResult('info', '{"server":'
                                .'[ {"label":"' . string('INFORMATION_VERSION') . '", "text":"' . $::VERSION . ' - ' . $::REVISION . ' @ ' . $::BUILDDATE . '"},'
                                .  '{"label":"' . string('INFORMATION_HOSTNAME') . '", "text":"' . Slim::Utils::Network::hostName() . '"},'
                                .  '{"label":"' . string('INFORMATION_SERVER_IP') . '", "text":"' . Slim::Utils::Network::serverAddr() . '"},'
                                .  '{"label":"' . string('INFORMATION_OPERATINGSYSTEM') . '", "text":"' . $osDetails->{'osName'} . ' - ' . $serverprefs->get('language') .
                                      ' - ' . Slim::Utils::Unicode::currentLocale() . '"},'
                                .  '{"label":"' . string('INFORMATION_ARCHITECTURE') . '", "text":"' . ($osDetails->{'osArch'} ? $osDetails->{'osArch'} : '?') . '"},'
                                .  '{"label":"' . string('PERL_VERSION') . '", "text":"' . $Config{'version'} . ' - ' . $Config{'archname'} . '"},'
                                .  '{"label":"Audio::Scan", "text":"' . $Audio::Scan::VERSION . '"},'
                                .  '{"label":"IO::Socket::SSL", "text":"' . (Slim::Networking::Async::HTTP->hasSSL() ? $IO::Socket::SSL::VERSION : string('BLANK')) . '"}'

                                . ( Slim::Schema::hasLibrary() ? ', {"label":"' . string('DATABASE_VERSION') . '", "text":"' .
                                      Slim::Utils::OSDetect->getOS->sqlHelperClass->sqlVersionLong( Slim::Schema->dbh ) . '"}' : '')

                                .']}');
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'transferqueue') {
        my $fromId = $request->getParam('from');
        my $toId = $request->getParam('to');
        my $mode = $request->getParam('mode');
        if (!$fromId || !$toId || !$mode) {
            $request->setStatusBadParams();
            return;
        }
        my $from = Slim::Player::Client::getClient($fromId);
        my $to = Slim::Player::Client::getClient($toId);
        if (!$from || !$to) {
            $request->setStatusBadParams();
            return;
        }

        # Remember if source was playing, and start dest playing if so
        my $fromWasPlaying = $from->isPlaying();
        my $toWasPlaying = $to->isPlaying();
        my $fromCurrentIndex = Slim::Player::Source::playingSongIndex($from);
        my $toCurrentIndex = Slim::Player::Source::playingSongIndex($to);
        my $srcIsGroup = $from->model eq 'group';
        my $isMoveFromGroupToMember = 0;

        # Get list of players source is currently synced with
        my @sourceBuddies;
        if ($from->isSynced()) {
            @sourceBuddies = $from->syncedWith();
            # Check that we are not already synced with dest player...
            for my $buddy (@sourceBuddies) {
                if ($buddy->id() eq $toId) {
                    if ($srcIsGroup && $mode eq 'move') {
                        $isMoveFromGroupToMember = 1;
                        last;
                    } else {
                        main::INFOLOG && $log->is_info && $log->info("Tried to move client $fromId to a player its already synced with ($toId)");
                        $request->setStatusDone();
                        if ($mode eq 'move') {
                            $request->addResult('error', string('PLUGIN_MATERIAL_SKIN_QT_MOVE_ERROR'));
                        } elsif ($mode eq 'copy') {
                            $request->addResult('error', string('PLUGIN_MATERIAL_SKIN_QT_COPY_ERROR'));
                        } elsif ($mode eq 'swap') {
                            $request->addResult('error', string('PLUGIN_MATERIAL_SKIN_QT_SWAP_ERROR'));
                        } else {
                            $request->setStatusBadParams();
                        }
                        return;
                    }
                }
            }
        }

        # Get list of players dest is currently synced with
        my @destBuddies;
        if ($to->isSynced()) {
            @destBuddies = $to->syncedWith();
        }

        $to->execute(['power', 1]) unless $to->power;

        if ($mode eq 'swap') {
            my $fromPl = 'material-skin-swap-' . $fromId;
            my $toPl = 'material-skin-swap-' . $toId;
            $fromPl =~ s/:/_/g;
            $toPl =~ s/:/_/g;

            # Save to temporary playlists
            $from->execute(['playlist', 'save', $fromPl]);
            my $fromPlObj = Slim::Schema->single('Playlist', { 'title' => $fromPl });
            if (!blessed($fromPlObj)) {
                $request->setStatusBadParams();
                return;
            }
            $to->execute(['playlist', 'save', $toPl]);
            my $toPlObj = Slim::Schema->single('Playlist', { 'title' => $toPl });
            if (!blessed($toPlObj)) {
                Slim::Control::Request::executeRequest(undef, ['playlists', 'delete', 'playlist_id:' . $fromPlObj->id]);
                $request->setStatusBadParams();
                return;
            }

            # Clear players, and load temp playlists
            $from->execute(['playlist', 'clear']);
            $from->execute(['playlistcontrol', 'cmd:add', 'playlist_id:' . $toPlObj->id]);
            $to->execute(['playlist', 'clear']);
            $to->execute(['playlistcontrol', 'cmd:add', 'playlist_id:' . $fromPlObj->id]);

            # Tidy up - remove temp playlists
            Slim::Control::Request::executeRequest(undef, ['playlists', 'delete', 'playlist_id:' . $fromPlObj->id]);
            Slim::Control::Request::executeRequest(undef, ['playlists', 'delete', 'playlist_id:' . $toPlObj->id]);
        } else {
            # Sync with destination player - queue will be copied
            $from->execute(['sync', $toId]);
            if ( exists $INC{'Slim/Plugin/RandomPlay/Plugin.pm'} && (my $mix = Slim::Plugin::RandomPlay::Plugin::active($from)) ) {
                $to->execute(['playlist', 'addtracks', 'listRef', ['randomplay://' . $mix] ]);
            }
            # Switch to now playing view?
            $to->execute(['now-playing']);
            # Now unsync source from dest
            $from->execute(['sync', '-']);
        }

        if ($isMoveFromGroupToMember) {
            $to->execute(['sync', '-']);
            for my $buddy (@destBuddies) {
                $buddy->execute(['playlist', 'clear']);
                $buddy->execute(['power', 0]);
            }
        } else {
            # If dest was in a sync group, re-add the buddies...
            for my $buddy (@destBuddies) {
                $to->execute(['sync', $buddy->id()]);
            }

            # Restore any previous synced players
            for my $buddy (@sourceBuddies) {
                $from->execute(['sync', $buddy->id()]);
            }
        }

        # If queue is moved then clear source
        if ($mode eq 'move') {
            $from->execute(['playlist', 'clear']);
            $from->execute(['power', 0]);
        }

        if ($mode eq 'swap') {
            if ($fromWasPlaying) {
                $to->execute(['playlist', 'index', $fromCurrentIndex]);
            }
            if ($toWasPlaying) {
                $from->execute(['playlist', 'index', $toCurrentIndex]);
            }
        } else {
            # Sometimes sync goes bit off even when all sync settings are correct so
            # if dest is synced power off and on again
            if ($to->isSynced() || $to->model eq 'group') {
                $to->execute(['power', 0]);
                # ...power back on after 1 second...
                Slim::Utils::Timers::setTimer($to, Time::HiRes::time() + 1.00, sub {
                    my ( $to, $fromWasPlaying ) = @_;
                    $to->execute(['power', 1]);

                    # If destination was a group, then power off/on yet again!
                    if ($to->model eq 'group') {
                        $to->execute(['power', 0]);
                        # ...and wait 1 second again...
                        Slim::Utils::Timers::setTimer($to, Time::HiRes::time() + 1.00, sub {
                            my ( $to, $fromWasPlaying ) = @_;
                            $to->execute(['power', 1]);
                            if ($fromWasPlaying) {
                                $to->execute(['play']);
                            }
                        }, $fromWasPlaying);
                    } elsif ($fromWasPlaying) {
                        $to->execute(['play']);
                    }
                }, $fromWasPlaying);
            } elsif ($fromWasPlaying) {
                $to->execute(['play']);
            }
        }

        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'delete-favorite') {
        my $url = $request->getParam('url');
        if (!$url) {
            $request->setStatusBadParams();
            return;
        }
        my $favs = Slim::Plugin::Favorites::OpmlFavorites->new('xx');
        $favs->deleteUrl($url);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'map') {
        my $va = $request->getParam('va');
        if ($va) {
            $request->addResult('artist_id', Slim::Schema->variousArtistsObject->id);
            $request->setStatusDone();
            return;
        }
        my $genre = $request->getParam('genre');
        my $artist = $request->getParam('artist');
        my $genre_id = $request->getParam('genre_id');
        my @list;
        my $sql;
        my $resp = "";
        my $resp_name;
        my $count = 0;
        my $dbh = Slim::Schema->dbh;
        my $col;
        if ($genre) {
            @list = split(/,/, $genre);
            $sql = $dbh->prepare_cached( qq{SELECT genres.id FROM genres WHERE name = ? LIMIT 1} );
            $resp_name = "genre_id";
            $col = 'id';
        } elsif ($genre_id) {
            @list = split(/,/, $genre_id);
            $sql = $dbh->prepare_cached( qq{SELECT genres.name FROM genres WHERE id = ? LIMIT 1} );
            $resp_name = "genre";
            $col = 'name';
        } elsif ($artist) {
            @list = split(/,/, $artist);
            $sql = $dbh->prepare_cached( qq{SELECT contributors.id FROM contributors WHERE name = ? LIMIT 1} );
            $resp_name = "artist_id";
            $col = 'id';
        } else {
            $request->setStatusBadParams();
            return;
        }

        foreach my $g (@list) {
            $sql->execute($g);
            if ( my $result = $sql->fetchall_arrayref({}) ) {
                my $val = $result->[0]->{$col} if ref $result && scalar @$result;
                if ($val) {
                    if ($count>0) {
                        $resp = $resp . ",";
                    }
                    $resp=$resp . $val;
                    $count++;
                }
            }
        }
        $request->addResult($resp_name, $resp);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'resolve') {
        my $fav_url = $request->getParam('fav_url');
        my $dbh = Slim::Schema->dbh;
        if ($fav_url) {
            my $genreId = _fetchDbVal($dbh, qq{SELECT genres.id FROM genres WHERE name = ? LIMIT 1}, _getUrlQueryParam($fav_url, "genre.name"), "id");
            my $artistId = _fetchDbVal($dbh, qq{SELECT contributors.id FROM contributors WHERE name = ? LIMIT 1}, _getUrlQueryParam($fav_url, "contributor.name"), "id");
            my $albumId = $artistId
                            ? _fetchDbVal($dbh, qq{SELECT albums.id FROM albums WHERE title = ? AND contributor = ? LIMIT 1}, [_getUrlQueryParam($fav_url, "album.title"), $artistId], "id")
                            : _fetchDbVal($dbh, qq{SELECT albums.id FROM albums WHERE title = ? LIMIT 1}, _getUrlQueryParam($fav_url, "album.title"), "id");
            my $workId = _fetchDbVal($dbh, qq{SELECT works.id FROM works WHERE title = ? LIMIT 1}, _getUrlQueryParam($fav_url, "work.title"), "id");
            my $performance = _getUrlQueryParam($fav_url, "track.performance");
            my $artistName;
            if ( $workId && $albumId && $fav_url =~ /^db:album.title/ ) {
                $artistName = _fetchDbVal($dbh,
                                          qq{
                                              SELECT contributors.name FROM albums JOIN tracks ON albums.id = tracks.album JOIN contributors ON contributors.id = tracks.primary_artist
                                              WHERE albums.id = ? AND tracks.work = ? AND ( (? IS NULL AND tracks.performance IS NULL) OR tracks.performance = ? ) LIMIT 1
                                          },
                                          [$albumId, $workId, $performance, $performance],
                                          "name");
            } else {
                $artistName = _getUrlQueryParam($fav_url, "contributor.name");
            }
            my $composerId = _fetchDbVal($dbh, qq{SELECT contributors.id FROM contributors WHERE name = ? LIMIT 1}, _getUrlQueryParam($fav_url, "composer.name"), "id");

            if ($genreId) {
                $request->addResult('genre_id', $genreId);
            }
            if ($artistId) {
                $request->addResult('artist_id', $artistId);
            }
            if ($albumId) {
                $request->addResult('album_id', $albumId);
                if ( $artistName = uri_unescape($artistName) ) {
                    utf8::decode($artistName);
                    $request->addResult('artist_name', $artistName);
                }
                my $albumsRequest = Slim::Control::Request->new( undef, [ 'albums', 0, 1, "album_id:$albumId", "tags:2q" ] );
                $albumsRequest->execute();
                if ($albumsRequest->isStatusError()) {
                    $log->error($albumsRequest->getStatusText());
                } else {
                    $request->addResult('disc_count', @{$albumsRequest->getResult('albums_loop')}[0]->{'disccount'});
                    $request->addResult('group_count', @{$albumsRequest->getResult('albums_loop')}[0]->{'group_count'});
                    $request->addResult('contiguous_groups', @{$albumsRequest->getResult('albums_loop')}[0]->{'contiguous_groups'});
                }
            }
            if ($workId) {
                $request->addResult('work_id', $workId);
            }
            if ($composerId) {
                $request->addResult('composer_id', $composerId);
            }
            if ( $performance = uri_unescape($performance) ) {
                utf8::decode($performance);
                $request->addResult('performance', $performance);
            }
            if (index($fav_url, "file:///")==0 && index($fav_url, ".m3u")==(length($fav_url)-4)) {
                my $rs = Slim::Schema->rs('Playlist')->getPlaylists('all', undef, undef);
                for my $item ($rs->slice(0, 25000)) {
                    if ($item->url eq $fav_url) {
                        $request->addResult('playlist_id', $item->id());
                        last;
                    }
                }
            }
            $request->setStatusDone();
        } else {
            $request->setStatusBadParams();
        }
        return;
    }

    if ($cmd eq 'delete-podcast') {
        my $pos = $request->getParam('pos');
        my $name = $request->getParam('name');
        if (defined $pos) {
            my $podPrefs = preferences('plugin.podcast');
            my $feeds = $podPrefs->get('feeds');
            if ($pos < scalar @{$feeds}) {
                if (@{$feeds}[$pos]->{'name'} eq $name) {
                    splice @{$feeds}, $pos, 1;
                    $podPrefs->set(feeds => $feeds);
                    $request->setStatusDone();
                } else {
                    $request->setStatusBadParams();
                }
                return;
            }
        }
    }

    if ($cmd eq 'plugins') {
        my ($current, $active, $inactive, $hide) = getCurrentPlugins();
        my $cnt = 0;
        foreach my $plugin (@{$active}) {
            $request->addResultLoop("plugins_loop", $cnt, "name", $plugin->{name});
            $request->addResultLoop("plugins_loop", $cnt, "title", $plugin->{title});
            $request->addResultLoop("plugins_loop", $cnt, "descr", $plugin->{desc});
            $request->addResultLoop("plugins_loop", $cnt, "creator", $plugin->{creator});
            $request->addResultLoop("plugins_loop", $cnt, "homepage", $plugin->{homepage});
            $request->addResultLoop("plugins_loop", $cnt, "email", $plugin->{email});
            $request->addResultLoop("plugins_loop", $cnt, "version", $plugin->{version});
            $cnt++;
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugins-status') {
        $request->addResult("needs_restart", Slim::Utils::PluginManager->needsRestart ? 1 : 0);
        $request->addResult("downloading", Slim::Utils::PluginDownloader->downloading ? 1 : 0);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugins-update') {
        my $json = $request->getParam('plugins');
        if ($json) {
            my $updating = 0;
            my $plugins = eval { from_json( $json ) };
            for my $plugin (@{$plugins}) {
                Slim::Utils::PluginDownloader->install({ name => $plugin->{'name'}, url => $plugin->{'url'}, sha => $plugin->{'sha'} });
                $updating++;
            }
            $request->addResult("updating", $updating);
            $request->setStatusDone();
            return;
        }
    }

    if ($cmd eq 'plugins-manage') {
        my $all = Slim::Utils::PluginManager->allPlugins();
        my $states = preferences('plugin.state');
        my $cnt = 0;
        for my $name (sort keys %{$all}) {
            my $entry = $all->{$name};
            if ($entry->{'enforce'}) {
                next;
            }
            if ($entry->{needsMySB} && $entry->{needsMySB} !~ /false|no/i) {
                next;
            }
            my $state = $states->get($name) || 'disabled';
            my $enabled = ($state =~ /^enabled/ || $state eq 'needs-enable') ? 1 : 0;
            my $pending = ($state =~ /needs/) ? 1 : 0;
            $request->addResultLoop('plugins_loop', $cnt, 'name', $name);
            $request->addResultLoop('plugins_loop', $cnt, 'title', string($entry->{'name'}));
            $request->addResultLoop('plugins_loop', $cnt, 'descr', string($entry->{'description'}));
            $request->addResultLoop('plugins_loop', $cnt, 'creator', $entry->{'creator'} || '');
            $request->addResultLoop('plugins_loop', $cnt, 'homepage', $entry->{'homepageURL'} || '');
            $request->addResultLoop('plugins_loop', $cnt, 'email', $entry->{'email'} || '');
            $request->addResultLoop('plugins_loop', $cnt, 'version', $entry->{'version'} || '');
            $request->addResultLoop('plugins_loop', $cnt, 'category', $entry->{'category'} || 'misc');
            $request->addResultLoop('plugins_loop', $cnt, 'enabled', $enabled);
            $request->addResultLoop('plugins_loop', $cnt, 'pending', $pending);
            $request->addResultLoop('plugins_loop', $cnt, 'error', Slim::Utils::PluginManager->getErrorString($name));
            $request->addResultLoop('plugins_loop', $cnt, 'installType', $entry->{'basedir'} !~ /InstalledPlugins/ ? 'manual' : 'install');
            my $settingsUrl = '';
            if ($enabled && $entry->{'optionsURL'}) {
                $settingsUrl = $entry->{'optionsURL'};
            }
            $request->addResultLoop('plugins_loop', $cnt, 'settings', $settingsUrl);
            my $icon = $entry->{'icon'} || '';
            if (!$icon) {
                $icon = 'html/images/' . ($entry->{'category'} || 'misc') . '.svg';
            }
            $request->addResultLoop('plugins_loop', $cnt, 'icon', $icon);
            $cnt++;
        }
        $request->addResult('needs_restart', Slim::Utils::PluginManager->needsRestart ? 1 : 0);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugins-settings') {
        my $extPrefs = preferences('plugin.extensions');
        my $repos = $extPrefs->get('repos') || [];
        $request->addResult('auto', $extPrefs->get('auto') ? 1 : 0);
        $request->addResult('useUnsupported', $extPrefs->get('useUnsupported') ? 1 : 0);
        $request->addResult('repos', to_json($repos));
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugins-settings-set') {
        my $extPrefs = preferences('plugin.extensions');
        if (defined $request->getParam('auto')) {
            Slim::Utils::ExtensionsManager->autoUpdate(int($request->getParam('auto')) ? 1 : 0);
        }
        if (defined $request->getParam('useUnsupported')) {
            Slim::Utils::ExtensionsManager->useUnsupported(int($request->getParam('useUnsupported')) ? 1 : 0);
        }
        if (my $json = $request->getParam('repos')) {
            my $repos = eval { from_json($json) };
            if (ref $repos eq 'ARRAY') {
                my @clean = grep { $_ && $_ =~ /\S/ } @$repos;
                my $old = $extPrefs->get('repos') || [];
                my %newSet = map { $_ => 1 } @clean;
                my %oldSet = map { $_ => 1 } @$old;
                for my $repo (@$old) {
                    if (!$newSet{$repo}) {
                        Slim::Utils::ExtensionsManager->removeRepo({ repo => $repo });
                    }
                }
                for my $repo (@clean) {
                    if (!$oldSet{$repo}) {
                        Slim::Utils::ExtensionsManager->addRepo({ repo => $repo });
                    }
                }
                $extPrefs->set('repos', \@clean);
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugins-catalog') {
        $request->setStatusProcessing();
        my ($current, $active, $inactive, $hide) = getCurrentPlugins();
        my %sections = ();
        my %repoTitles = ();
        Slim::Utils::ExtensionsManager::getAllPluginRepos({
            type    => 'plugin',
            details => 1,
            stepCb  => sub {
                my ($res, $info, $weight) = @_;
                return if !$info || !$res;
                my $repo = $info->{'name'};
                $repoTitles{$repo} = $info->{'title'} || $repo;
                push @{$sections{$repo}}, @$res;
            },
            cb => sub {
                my ($allPlugins, $err) = @_;
                $log->error($err) if $err;
                my $cnt = 0;
                for my $repo (sort { ($repoTitles{$a} || $a) cmp ($repoTitles{$b} || $b) } keys %sections) {
                    my @plugins = sort {
                        lc(($a->{'title'} || $a->{'name'}) || '') cmp lc(($b->{'title'} || $b->{'name'}) || '')
                    } @{$sections{$repo} || []};
                    my %seen = ();
                    my $pCnt = 0;
                    for my $plugin (@plugins) {
                        my $name = $plugin->{'name'};
                        next if !$name || $hide->{$name} || $seen{$name}++;
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'name', $name);
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'title', $plugin->{'title'} || $name);
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'descr', $plugin->{'desc'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'creator', $plugin->{'creator'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'homepage', $plugin->{'link'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'email', $plugin->{'email'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'version', $plugin->{'version'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'category', $plugin->{'category'} || 'misc');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'url', $plugin->{'url'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'sha', $plugin->{'sha'} || '');
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'installations',
                            defined $plugin->{'installations'} ? int($plugin->{'installations'}) : 0);
                        my $catIcon = $plugin->{'icon'} || '';
                        if (!$catIcon) {
                            $catIcon = 'html/images/' . ($plugin->{'category'} || 'misc') . '.svg';
                        }
                        # Relative plugin package icons for not-yet-installed catalog entries
                        # often only exist after install; leave as-is for client / LMS static path.
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'icon', $catIcon);
                        $request->addResultLoop("catalog_${cnt}_plugins_loop", $pCnt, 'unsupported',
                            (($plugin->{'title'} && $plugin->{'title'} =~ /unsupported/i)
                                || ($plugin->{'desc'} && $plugin->{'desc'} =~ /unsupported/i)
                                || $repo =~ /unsupported\.xml/) ? 1 : 0);
                        $pCnt++;
                    }
                    next if $pCnt < 1;
                    $request->addResultLoop('catalog_sections_loop', $cnt, 'repo', $repo);
                    $request->addResultLoop('catalog_sections_loop', $cnt, 'title', $repoTitles{$repo} || $repo);
                    $cnt++;
                }
                $request->setStatusDone();
            },
        });
        return;
    }

    if ($cmd eq 'plugin-install') {
        my $name = $request->getParam('name');
        my $url = $request->getParam('url');
        my $sha = $request->getParam('sha');
        if (!$name) {
            $request->setStatusBadParams();
            return;
        }
        Slim::Utils::ExtensionsManager->enablePlugin($name);
        if ($url) {
            Slim::Utils::PluginDownloader->install({ name => $name, url => $url, sha => $sha || '' });
            $request->addResult('downloading', 1);
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'plugin-enabled') {
        my $name = $request->getParam('name');
        if (!$name) {
            $request->setStatusBadParams();
            return;
        }
        my $enabled = $request->getParam('enabled');
        if (defined $enabled && int($enabled)) {
            Slim::Utils::PluginManager->enablePlugin($name);
        } else {
            Slim::Utils::PluginManager->disablePlugin($name);
        }
        $request->addResult('needs_restart', Slim::Utils::PluginManager->needsRestart ? 1 : 0);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'extras') {
        my $cnt = 0;
        my $icons;
        my %hideExtras = map { $_ => 1 } split(/,/, $prefs->get('hideExtras'));
        while (my ($menu, $menuItems) = each %Slim::Web::Pages::additionalLinks ) {
            if ($menu eq 'icons') {
                $icons = $menuItems;
            }
        }

        while (my ($menu, $menuItems) = each %Slim::Web::Pages::additionalLinks ) {
            if ($menu eq 'plugins') {
                foreach my $key (keys %$menuItems) {
                    if ((not exists($EXCLUDE_EXTRAS{$key})) && (not exists($hideExtras{$key}))) {
                        $request->addResultLoop("extras_loop", $cnt, "id", $key);
                        # Absolute LMS-root path so mobile Material (/material/) does not resolve under /material/plugins/…
                        my $url = $menuItems->{$key} // '';
                        $url = '/' . $url if length($url) && $url !~ m{^/} && $url !~ m{^https?://}i;
                        $request->addResultLoop("extras_loop", $cnt, "url", $url);
                        $request->addResultLoop("extras_loop", $cnt, "title", string($key));
                        if ($icons and $icons->{$key}) {
                            $request->addResultLoop("extras_loop", $cnt, "icon", $icons->{$key});
                        }
                        $cnt++;
                    }
                }
            } elsif ($menu eq 'browseiPeng') {
                foreach my $key (keys %$menuItems) {
                    if ((not exists($EXCLUDE_EXTRAS{$key})) && (not exists($hideExtras{$key}))) {
                        $request->addResultLoop("extras_loop", $cnt, "id", $key);
                        my $url = $menuItems->{$key} // '';
                        $url = '/' . $url if length($url) && $url !~ m{^/} && $url !~ m{^https?://}i;
                        $request->addResultLoop("extras_loop", $cnt, "url", $url);
                        $request->addResultLoop("extras_loop", $cnt, "title", string($key));
                        if ($icons and $icons->{$key}) {
                            $request->addResultLoop("extras_loop", $cnt, "icon", $icons->{$key});
                        }
                        $cnt++;
                    }
                }
            }
        }
        # Clients that use list paging expect a count
        $request->addResult('count', $cnt);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'delete-vlib') {
        my $id = $request->getParam('id');
        if ($id) {
            Slim::Music::VirtualLibraries->unregisterLibrary($id);
            $request->setStatusDone();
            Slim::Control::Request::notifyFromArray(undef, ['material-skin', 'notification', 'internal', 'vlib']);
            return;
        }
    }

    if ($cmd eq 'pass-isset') {
        my $storedPass = $prefs->get('password');
        if (($storedPass eq '')) {
            $request->addResult("set", 0);
        } else {
            $request->addResult("set", 1);
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'pass-check') {
        my $pass = $request->getParam('pass');
        if ($pass) {
            my $storedPass = $prefs->get('password');
            if (($storedPass eq '') || ($storedPass eq $pass)) {
                $request->addResult("ok", 1);
            } else {
                $request->addResult("ok", 0);
            }
            $request->setStatusDone();
            return;
        }
    }

    if ($cmd eq 'browsemodes') {
        my $useUnifiedArtistsList = $serverprefs->get('useUnifiedArtistsList');
        my $cnt = 0;

        foreach my $node (@{Slim::Menu::BrowseLibrary->_getNodeList()}) {
            if ($node->{id} eq 'myMusicSearch') {
                next;
            }
            if ($useUnifiedArtistsList) {
                if (($node->{'id'} eq 'myMusicArtistsAllArtists') || ($node->{'id'} eq 'myMusicArtistsAlbumArtists')) {
                    next;
                }
            } else {
                if ($node->{'id'} eq 'myMusicArtists') {
                    next;
                }
            }
            $request->addResultLoop("modes_loop", $cnt, "id", $node->{'id'});
            $request->addResultLoop("modes_loop", $cnt, "text", string($node->{'name'}));
            $request->addResultLoop("modes_loop", $cnt, "weight", $node->{'weight'});
            $request->addResultLoop("modes_loop", $cnt, "params", $node->{'params'});
            if ($node->{'jiveIcon'}) {
                $request->addResultLoop("modes_loop", $cnt, "icon", $node->{'jiveIcon'});
            } elsif ($node->{'icon'}) { # ???
                $request->addResultLoop("modes_loop", $cnt, "icon", $node->{'icon'});
            }
            $cnt++;
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'geturl') {
        my $url = $request->getParam('url');
        my $format = $request->getParam('format');
        if ($url) {
            main::DEBUGLOG && $log->debug("Get URL: $url");
            $request->setStatusProcessing();

            my $ua = Slim::Utils::Misc::userAgentString();
            $ua =~ s{iTunes/4.7.1}{Mozilla/5.0};
            my %headers = ( 'User-Agent' => $ua );

            Slim::Networking::SimpleAsyncHTTP->new(
                sub {
                    main::DEBUGLOG && $log->debug("Fetched URL");
                    my $response = shift;
                    my $content = $response->can('decoded_content')
                                ? $response->decoded_content
                                : $response->content;

                    eval {
                        if ( ($response->headers->content_type =~ /xml/) || ($format && $format eq 'xml')) {
                            require XML::Simple;
                            $request->addResult("content", XML::Simple::XMLin($content));
                        } elsif ( ($response->headers->content_type =~ /json/) || ($format && $format eq 'json') ) {
                            $request->addResult("content", from_json($content));
                        } else {
                            $request->addResult("content", $content);
                        }
                    };
                    $request->setStatusDone();
                    if ( $@ ) {
                        my $error = "$@";
                        main::DEBUGLOG && $log->debug("Failed to parser response of URL: $error");
                    }
                },
                sub {
                    my $response = shift;
                    my $error  = $response->error;
                    main::DEBUGLOG && $log->debug("Failed to fetch URL: $error");
                    $request->setStatusDone();
                }, {
                   timeout => 15
                }
                )->get($url, %headers);
            return;
        }
    }

    if ($cmd eq 'command') {
        my $act = $request->getParam('cmd');
        if ($act) {
            $request->setStatusDone();
            system("$act");
            return;
        }
    }

    if ($cmd eq 'scantypes') {
        my @ver = split(/\./, $::VERSION);
        if (int($ver[0])<8) {
            $request->setResultLoopHash('item_loop', 0, { name => string('SETUP_STANDARDRESCAN'), cmd  => ['rescan'] });
            $request->setResultLoopHash('item_loop', 1, { name => string('SETUP_WIPEDB'), cmd  => ['wipecache'] });
            $request->setResultLoopHash('item_loop', 2, { name => string('SETUP_PLAYLISTRESCAN'), cmd  => ['rescan', 'playlists'] });
        } else {
            my $cnt = 0;
            my $scanTypes = Slim::Music::Import->getScanTypes();
            foreach ( map {
                    {
                            name => $scanTypes->{$_}->{name},
                            cmd => $scanTypes->{$_}->{cmd},
                            value => $_
                    }
            } sort keys %$scanTypes ) {
                $request->setResultLoopHash('item_loop', $cnt++, {
                        name => string($_->{name}),
                        cmd  => $_->{cmd} });
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'server') {
        $request->addResult("libraryname", Slim::Utils::Misc::getLibraryName());
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'themes') {
        my $cnt = 0;
        my $platform = $request->getParam('platform');
        my @variants=('light', 'dark');
        if ($platform) {
            foreach my $variant (@{variants}) {
                my $path = dirname(__FILE__) . "/HTML/material/html/css/themes/" . $platform . "/" . $variant;
                if (-d $path) {
                    opendir DIR, $path;
                    my @items = readdir(DIR);
                    close DIR;
                    foreach (@items) {
                        if (-f $path . "/" . $_ ) {
                            my @parts = split(/\./, $_);
                            if (((scalar(@parts)==2) && $parts[1]=='css') || ((scalar(@parts)==3) && $parts[1]=='min' && $parts[2]=='css')) {
                                $request->addResultLoop("themes", $cnt, "label", $parts[0]);
                                $request->addResultLoop("themes", $cnt, "key", $platform . "/" . $variant . "/" . $parts[0]);
                                $cnt++;
                            }
                        }
                    }
                }
            }
        }

        foreach my $variant (@{variants}) {
            my $path = Slim::Utils::Prefs::dir() . "/material-skin/themes/" . $variant;
            if (-d $path) {
                opendir DIR, $path;
                my @items = readdir(DIR);
                close DIR;
                foreach (@items) {
                    if (-f $path . "/" . $_ ) {
                        my @parts = split(/\./, $_);
                        if ((scalar(@parts)==2) && $parts[1]=='css') {
                            $request->addResultLoop("themes", $cnt, "label", $parts[0]);
                            $request->addResultLoop("themes", $cnt, "key", "user:" . $variant . "/" . $parts[0]);
                            $cnt++;
                        }
                    }
                }
            }
        }

        my $path = Slim::Utils::Prefs::dir() . "/material-skin/colors";
        if (-d $path) {
            opendir DIR, $path;
            my @items = readdir(DIR);
            close DIR;
            $cnt = 0;
            foreach (@items) {
                my $colorPath = $path . "/" . $_ ;
                if (-f $colorPath ) {
                    my @parts = split(/\./, $_);
                    if ((scalar(@parts)==2) && $parts[1]=='css') {
                        open my $info, $colorPath or next;
                        my $color="";
                        while (my $line = <$info>) {
                            if (index($line, '--primary-color')>=0) {
                                my @parts = split(/:/, $line);
                                if (scalar(@parts)==2) {
                                    $color = $parts[1];
                                    $color =~ s/^\s+|\s+$//g;
                                    $color =~ s/;//g;
                                }
                            }
                        }
                        close $info;
                        # --primary-color:#1976d2;
                        if (length($color)>=4) {
                            $request->addResultLoop("colors", $cnt, "color", $color);
                            $request->addResultLoop("colors", $cnt, "key", "user:" . $parts[0]);
                            $cnt++;
                        }
                    }
                }
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'playersettings') {
        my $cnt = 0;
        foreach my $key (keys %{$prefs->{prefs}}) {
            if ($key =~ /^_client:.+/) {
                my $icon = $prefs->get($key)->{'icon'};
                my $color = $prefs->get($key)->{'color'};
                if ($icon || $color) {
                    $request->addResultLoop("players", $cnt, "id", substr($key, 8));
                    if ($icon) {
                        $request->addResultLoop("players", $cnt, "icon", $icon);
                    }
                    if ($color) {
                        $request->addResultLoop("players", $cnt, "color", $color);
                    }
                    $cnt++;
                }
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'activeplayers') {
        my $cnt = 0;
        my @players = Slim::Player::Client::clients();
        for my $player (@players) {
            if ($player->power() && $player->isPlaying()) {
                $request->addResultLoop("players", $cnt, "id", $player->id());
                $cnt++;
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'urls') {
        my $tracks = $request->getParam('tracks');
        if ($tracks) {
            my $dbh = Slim::Schema->dbh;
            my @list = split(/,/, $tracks);
            my $sql = $dbh->prepare_cached( qq{SELECT url FROM tracks WHERE id = ? LIMIT 1} );
            my $cnt = 0;
            foreach my $t (@list) {
                $sql->execute($t);
                if ( my $result = $sql->fetchall_arrayref({}) ) {
                    my $url = $result->[0]->{'url'} if ref $result && scalar @$result;
                    if ($url) {
                        $request->addResultLoop("urls_loop", $cnt, "url", $url);
                        $request->addResultLoop("urls_loop", $cnt, "id", $t);
                        $cnt++;
                    }
                }
            }
            $request->setStatusDone();
            return;
        }
    }

    if ($cmd eq 'adv-search') {
        my $params = {};
        my $saveLib = $request->getParam('savelib');

        foreach my $term (@ADV_SEARCH_OPS) {
            my $val = $request->getParam($term);
            my $op = $request->getParam($term . '.op');
            if ($op && $val) {
                $params->{'search.' . $term} = $val;
                $params->{'search.' . $term . '.op'} = $op;
            }
        }

        foreach my $term (@ADV_SEARCH_OTHER) {
            my $val = $request->getParam($term);
            if ($val) {
                $params->{'search.' . $term} = $val;
            }
        }

        my $roles = $serverprefs->get('userDefinedRoles');
        foreach my $role (keys %{$roles}) {
            my $term = "contributor_namesearch.active" . $roles->{$role}->{id};
            my $val = $request->getParam($term);
            if ($val) {
                $params->{'search.' . $term} = $val;
            }
        }

        if ($saveLib) {
            $params->{'action'} = 'saveLibraryView';
            $params->{'saveSearch'} = $saveLib;
        }

        my $libId = $request->getParam('library_id');
        if ($libId) {
            $params->{'library_id'} = $libId;
        }

        my ($tracks, $albums, $works) = Plugins::MaterialSkin::Search::advancedSearch($request->client(), $params);

        if ($saveLib) {
            Slim::Control::Request::notifyFromArray(undef, ['material-skin', 'notification', 'internal', 'vlib']);
        } else {
            if (blessed($tracks)) {
                $tracks = $tracks->slice(0, $MAX_ADV_SEARCH_RESULTS);
                my $count = 0;
                while (my $track = $tracks->next) {
                    $request->addResultLoop('titles_loop', $count, 'id', $track->id);
                    $request->addResultLoop('titles_loop', $count, 'title', $track->title);
                    if ($track->coverid) {
                        $request->addResultLoop('titles_loop', $count, 'coverid', $track->coverid);
                    }
                    if ($track->tracknum) {
                        $request->addResultLoop('titles_loop', $count, 'tracknum', $track->tracknum);
                    }
                    $request->addResultLoop('titles_loop', $count, 'url', $track->url);
                    if ($track->year) {
                        $request->addResultLoop('titles_loop', $count, 'year', $track->year);
                    }
                    if ($track->disc) {
                        $request->addResultLoop('titles_loop', $count, 'disc', $track->disc);
                    }
                    if ($track->extid) {
                        $request->addResultLoop('titles_loop', $count, 'extid', $track->extid);
                    }
                    $request->addResultLoop('titles_loop', $count, 'bitrate', $track->bitrate);
                    $request->addResultLoop('titles_loop', $count, 'samplerate', $track->samplerate);
                    $request->addResultLoop('titles_loop', $count, 'type', $track->content_type);
                    $request->addResultLoop('titles_loop', $count, 'duration', $track->secs);
                    if ($track->rating) {
                        $request->addResultLoop('titles_loop', $count, 'rating', $track->rating);
                    }
                    if ($track->album) {
                        $request->addResultLoop('titles_loop', $count, 'album', $track->album->name);
                        $request->addResultLoop('titles_loop', $count, 'album_id', $track->album->id);
                    }
                    if ($track->artist) {
                        $request->addResultLoop('titles_loop', $count, 'artist', $track->artist->name);
                        $request->addResultLoop('titles_loop', $count, 'artist_id', $track->artist->id);
                    }
                    $count++;
                    main::idleStreams() unless $count % 5;
                }
            }
            if (blessed($albums)) {
                $albums = $albums->slice(0, $MAX_ADV_SEARCH_RESULTS);
                my $count = 0;
                while (my $album = $albums->next) {
                    $request->addResultLoop('albums_loop', $count, 'id', $album->id);
                    $request->addResultLoop('albums_loop', $count, 'album', $album->name);
                    if ($album->year) {
                        $request->addResultLoop('albums_loop', $count, 'year', $album->year);
                    }
                    if ($album->artwork) {
                        $request->addResultLoop('albums_loop', $count, 'artwork_track_id', $album->artwork);
                    }
                    if ($album->contributor) {
                        $request->addResultLoop('albums_loop', $count, 'artist', $album->contributor->name);
                        $request->addResultLoop('albums_loop', $count, 'artist_id', $album->contributor->id);
                    }
                    if ($album->extid) {
                        $request->addResultLoop('albums_loop', $count, 'extid', $album->extid);
                    }
                    # TODO: artists, artwork_url ???
                    $count++;
                    main::idleStreams() unless $count % 5;
                }
            }
            if (blessed($works)) {
                $works = $works->slice(0, $MAX_ADV_SEARCH_RESULTS);
                my $count = 0;
                while (my $work = $works->next) {
                    $request->addResultLoop('works_loop', $count, 'id', $work->id);
                    $request->addResultLoop('works_loop', $count, 'album_id', $work->get_column('albumId')) if Slim::Utils::Versions->compareVersions($::VERSION, '9.0.2')>=0;
                    $count++;
                    main::idleStreams() unless $count % 5;
                }
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'adv-search-params') {
        my $params = Plugins::MaterialSkin::Search::options($request->client());

        my $count = 0;
        while (my $genre = $params->{'genres'}->next) {
            $request->addResultLoop('genres_loop', $count, 'id', $genre->id);
            $request->addResultLoop('genres_loop', $count, 'name', $genre->name);
            $count++;
        }
        $count = 0;
        foreach my $samplerate (@{$params->{'samplerates'}}) {
            $request->addResultLoop('samplerates_loop', $count, 'rate', $samplerate);
            $count++;
        }
        $count = 0;
        foreach my $samplesize (@{$params->{'samplesizes'}}) {
            $request->addResultLoop('samplesizes_loop', $count, 'size', $samplesize);
            $count++;
        }
        $count = 0;
        while (my ($k, $v) = each %{$params->{'fileTypes'}}) {
            $request->addResultLoop('filetypes_loop', $count, 'id', $k);
            $request->addResultLoop('filetypes_loop', $count, 'name', $v);
            $count++;
        }
        $request->addResult('statistics', $params->{'statistics'});
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'protocols') {
        my $allPlugs =  Slim::Utils::PluginManager->allPlugins();
        my %handlers = Slim::Player::ProtocolHandlers->registeredHandlers();
        my $count = 0;
        foreach my $prot (keys %handlers) {
            if (not exists($IGNORE_PROTOCOLS{$prot})) {
                my $handler = Slim::Player::ProtocolHandlers->handlerForProtocol($prot);
                if ($handler) {
                    my $str = "" . $handler;
                    my @list = split(/::/, $str);
                    if (scalar(@list)>=2 && ($list[0] eq 'Plugins') || ($list[0] eq 'Plugin')) {
                        $request->addResultLoop('protocols_loop', $count, 'scheme', $prot);
                        $request->addResultLoop('protocols_loop', $count, 'plugin', string($allPlugs->{$list[1]}{'name'}));
                        $count++;
                    }
                }
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'players-extra-info') {
        my @players = Slim::Player::Client::clients();
        my $cnt = 0;
        for my $player (@players) {
            if ($player->model ne 'group') {
                $request->addResultLoop("players", $cnt, "id", $player->id());
                $request->addResultLoop("players", $cnt, "signalstrength", $player->signalStrength() || 0);
                $request->addResultLoop("players", $cnt, "voltage", $player->voltage() || -1);
                $cnt++;
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'sort-playlist') {
        my $id=$request->getParam('playlist_id');
        if (!$id) {
            $request->setStatusBadParams();
            return;
        }
        my $playlist = Slim::Schema->find('Playlist', $id);
        if (!blessed($playlist)) {
            $request->setStatusBadParams();
            return;
        }

        my @tracks = $playlist->tracks;
        my $len = scalar(@tracks);
        if ($len>1) {
            @tracks = _sortTracks(\@tracks, $request->getParam('order'));
            $playlist->setTracks(\@tracks);
            $playlist->update;

            if ($playlist->content_type eq 'ssp') {
                Slim::Formats::Playlists->writeList(\@tracks, undef, $playlist->url);
            }

            Slim::Schema->forceCommit;
            Slim::Schema->wipeCaches;
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'mixer') {
        my $mcmd = $request->getParam('cmd');
        my $val = $request->getParam('val');
        my $players = $request->getParam('players');
        if (!$mcmd || !$players) {
            $request->setStatusBadParams();
            return;
        }
        my @list = split(/,/, $players);
        foreach my $id (@list) {
            my $player = Slim::Player::Client::getClient($id);
            if ($player) {
                if ($mcmd eq 'mute') {
                    $player->execute(['mixer', 'muting', $val]);
                } elsif ($mcmd eq 'set') {
                    my $old = $request->getParam('old');
                    my $pvol = $player->volume;
                    my $volume = $old<=0 ? $val : ($pvol * $val / $old);
                    if ($volume<0) {
                        $volume*=-1;
                    }
                    if ($volume>100) {
                        $volume = 100;
                    }
                    $player->execute(["mixer", "volume", $volume]);
                }
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'release-types') {
        if (Slim::Utils::Versions->compareVersions($::VERSION, '8.4.0') >= 0) {
            my $relTypes = Slim::Schema::Album->releaseTypes();
            my $cnt = 0;
            foreach my $rt (@{$relTypes}) {
                my $singular = _releaseTypeName($rt, '');
                my $plural = _releaseTypeName($rt, 'S');

                # If only have one of singular/plural then use the defined value for the missing value.
                if ($singular && !$plural) {
                    $plural = $singular;
                } elsif (!$singular && $plural) {
                    $singular = $plural;
                }

                if ($singular && $plural) {
                    $request->addResultLoop("rt_loop", $cnt, "type", $rt);
                    $request->addResultLoop("rt_loop", $cnt, "singular", $singular);
                    $request->addResultLoop("rt_loop", $cnt, "plural", $plural);
                    $cnt++;
                }
            }
        }
        $request->setStatusDone();
        return;
    }
    if ($cmd eq 'check-for-updates') {
        my $delay = $request->getParam('delay');
        if ($delay>=0) {
            main::DEBUGLOG && $log->debug("Updates request received, will check in ${delay} seconds");
            Slim::Utils::Timers::killTimers(undef, \&_checkUpdates);
            Slim::Utils::Timers::setTimer(undef, Time::HiRes::time() + $delay, \&_checkUpdates);
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'similar') {
        my $artist = $request->getParam('artist');
        if ($artist) {
            my $prefsDir = catdir(Slim::Utils::Prefs::dir(), 'material-skin', 'similar-artists');
            my $cacheDir = catdir($serverprefs->get('cachedir'), 'material-skin', 'similar-artists');
            my $key = lc($artist);
            my $ignoreAge = 0;
            $key =~ s/[\/\\\:\.\(\)\{\}\[\]]//g;
            main::DEBUGLOG && $log->debug("Get similar artists: $artist");
            $request->setStatusProcessing();

            # See if we can read existing version first...
            my $filePath = $prefsDir . "/" . ${key} . ".json";
            if (-e $filePath) {
                # Found in user's prefs folder, so ignore age checking - file is always valid
                $ignoreAge = 1;
            } else {
                # Not in prefs, look in cache
                $filePath = $cacheDir . "/" . ${key} . ".json";
            }
            my $fileContent;
            if (-e $filePath) {
                # Found existing, use that....
                $fileContent = read_file($filePath);
                main::DEBUGLOG && $log->debug("Reading ${filePath}");
                if (_handleSimilarArtists($request, $fileContent, 0, $key, $cacheDir, $ignoreAge)!=0) {
                    $request->setStatusDone();
                    return;
                }
                # ...to old? Call LastFM...
            }

            my $ua = Slim::Utils::Misc::userAgentString();
            $ua =~ s{iTunes/4.7.1}{Mozilla/5.0};
            my %headers = ( 'User-Agent' => $ua );
            $artist = URI::Escape::uri_escape_utf8($artist);
            my $url = "http://ws.audioscrobbler.com/2.0/?api_key=${LASTFM_API_KEY}&method=artist.getSimilar&autocorrect=1&format=json&limit=25&&artist=${artist}";

            Slim::Networking::SimpleAsyncHTTP->new(
                sub {
                    main::DEBUGLOG && $log->debug("Fetched similar artists");
                    my $response = shift;
                    _handleSimilarArtists($request, $response->content, 1, $key, $cacheDir, $ignoreAge);
                    $request->setStatusDone();
                    if ( $@ ) {
                        my $error = "$@";
                        main::DEBUGLOG && $log->debug("Failed to parser response of similar artists: $error");
                    }
                },
                sub {
                    my $response = shift;
                    my $error  = $response->error;
                    main::DEBUGLOG && $log->debug("Failed to fetch similar artists: $error");

                    # Failed to call LastFM, so use cached version even if expired
                    if (-e $filePath) {
                        main::DEBUGLOG && $log->debug("Reading ${filePath}");
                        _handleSimilarArtists($request, $fileContent, 0, $key, $cacheDir, 1);
                    }

                    $request->setStatusDone();
                }, {
                timeout => 15
                }
                )->get($url, %headers);
            return;
        }
    }

    if ($cmd eq 'apps') {
        my $combined = $prefs->get('combineAppsAndRadio');
        my $apps = Slim::Plugin::Base->nonSNApps();
        my $cnt = 0;
        my %hideApps = map { $_ => 1 } split(/,/, $prefs->get('hideApps'));
        for my $app (@$apps) {
            my $tag = $app->can('tag') && $app->tag;

            my $name = $app->getDisplayName;
            if ($tag && (not exists($hideApps{$app->tag})) && (not exists($hideApps{$name}))) {
                my $uiName = Slim::Utils::Strings::getString($name);
                my $icon = $app->_pluginDataFor('icon');
                $request->addResultLoop('item_loop', $cnt, 'text', $uiName);
                $request->addResultLoop('item_loop', $cnt, 'icon', $icon);
                $request->addResultLoop('item_loop', $cnt, 'type', 'redirect');
                my $actions = { go => { cmd => [ $app->tag, 'items' ], params => { menu => $app->tag } } };
                $request->addResultLoop('item_loop', $cnt, 'actions', $actions);
                if ($combined) {
                    my $category = $app->_pluginDataFor('category');
                    if (!$category) {
                        my $modeName = $app->modeName;
                        if (_startsWith($modeName, "Plugins::")) {
                            my @parts = split(/::/, $modeName);
                            if (scalar(@parts)>1) {
                                my $pluginName = $parts[1];
                                $category = $CATEGORIES_MAP->{$pluginName};
                            }
                        }
                    }
                    if (!$category) {
                        $category = "other";
                    }
                    $request->addResultLoop('item_loop', $cnt, 'mskcategory', $category);
                }
                $cnt++;
            }
        }

        if ($combined) {
            my $radiosReq = Slim::Control::Request::executeRequest(undef, ['radios', 0, 1000, 'menu:radio'] );
            my $addTuneIn = 0;
            foreach my $item ( @{ $radiosReq->getResult('item_loop') || [] } ) {
                if (!$item->{'icon-id'} || !_startsWith($item->{'icon-id'}, '/plugins/TuneIn')) {
                    foreach my $key (keys %$item) {
                        $request->addResultLoop('item_loop', $cnt, $key, $item->{$key});
                    }
                    $request->addResultLoop('item_loop', $cnt, 'mskcategory', 'radio');
                    $cnt++;
                } else {
                    $addTuneIn = 1;
                }
            }
            if ($addTuneIn==1) {
                $request->addResultLoop('item_loop', $cnt, 'addAction', 'go');
                $request->addResultLoop('item_loop', $cnt, 'type', 'redirect');
                $request->addResultLoop('item_loop', $cnt, 'text', 'TuneIn');
                $request->addResultLoop('item_loop', $cnt, 'svg', '/material/svg/tunein');
                $request->addResultLoop('item_loop', $cnt, 'mskcategory', 'radio');
                my $actions = { go => { cmd => [ 'radios' ], params => { menu => 'radio' } } };
                $request->addResultLoop('item_loop', $cnt, 'actions', $actions);
                $cnt++;
            }
        }
        $request->addResult('count', $cnt);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'rndmix') {
        my $act = $request->getParam('act');
        my $folder = Slim::Utils::Prefs::dir() . "/material-skin/random-mix";
        if ($act eq 'list') {
            my $extLen = length(RANDOM_MIX_EXT) * -1;
            my @files = glob('"' . $folder . '/*' . RANDOM_MIX_EXT . '"');
            my $cnt = 0;
            foreach my $file(@files) {
                main::DEBUGLOG && $log->debug("Mix file:" . $file);
                my $details = _readRandMix($file);
                if ($details) {
                    $request->addResultLoop('rndmix_loop', $cnt, 'name', decode('utf8', substr(basename($file), 0, $extLen)));
                    $request->addResultLoop('rndmix_loop', $cnt, 'mix', $details->{'mix'});
                }
                $cnt++;
            }
            if (0==$cnt) {
                $request->addResult("rndmix_loop", "");
            }
            $request->setStatusDone();
            return;
        } else {
            my $name = $request->getParam('name');
            if ($name) {
                if ($act eq 'read') {
                    my $path = File::Spec->catpath('', $folder, $name . RANDOM_MIX_EXT);
                    my $details = _readRandMix($path);
                    if ($details) {
                        $request->addResult("mix", $details->{'mix'});
                        $request->addResult("genres", $details->{'genres'});
                        $request->addResult("library", $details->{'library'});
                        $request->addResult("continuous", $details->{'continuous'});
                        $request->addResult("oldtracks", $details->{'oldtracks'});
                        $request->addResult("newtracks", $details->{'newtracks'});
                        $request->setStatusDone();
                        return;
                    }
                } elsif ($act eq 'save') {
                    my $mix = $request->getParam('mix');
                    if ($mix) {
                        $request->addResult("ok",
                            _saveRandMix($folder,
                                         $name,
                                         $mix,
                                         $request->getParam('genres'),
                                         $request->getParam('library'),
                                         int($request->getParam('continuous')),
                                         int($request->getParam('oldtracks')),
                                         int($request->getParam('newtracks'))));
                        $request->setStatusDone();
                        return;
                    }
                } elsif ($act eq 'delete') {
                    my $path = File::Spec->catpath('', $folder, $name . RANDOM_MIX_EXT);
                    $request->addResult("ok", _deleteFile($path));
                    $request->setStatusDone();
                    return;
                }
            }
        }
    }

    if ($cmd eq 'scan-progress') {
        if (Slim::Schema::hasLibrary()) {
            if (Slim::Music::Import->stillScanning()) {
                $request->addResult('rescan', "1");
                if (my $p = Slim::Schema->rs('Progress')->search({ 'type' => 'importer', 'active' => 1 })->first) {
                    # remove leading path information from the progress name
                    my $name = $p->name;
                    $name =~ s/(.*)\|//;

                    $request->addResult('progressname', $request->string($name . '_PROGRESS'));
                    $request->addResult('progressdone', $p->done);
                    $request->addResult('progresstotal', $p->total);
                }
            } else {
                $request->addResult( lastscan => Slim::Music::Import->lastScanTime() );
            }
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'send-notif') {
        my $msg = $request->getParam('msg');
        my $type = $request->getParam('type');
        my $client = $request->getParam('client');
        my $timeout = $request->getParam('timeout');
        if (!$msg || !$type || ($type ne 'info' && $type ne 'error')) {
            $request->setStatusBadParams();
            return;
        }

        Slim::Control::Request::notifyFromArray(undef, ['material-skin', 'notification', $type, $msg, undef, $client, $timeout]);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'home-extra') {
        _handleHomeExtraCmd($request);
        return;
    }

    if ($cmd eq 'home-extra-3rdparty') {
        $request->addResult("items", getHomeExtra3rdPartyItems());
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'context-stats-home') {
        _handleContextStatsHomeCmd($request);
        return;
    }

    if ($cmd eq 'sessions-prefs') {
        eval { require Plugins::MaterialSkin::SessionLog; };
        if ($@) {
            $request->addResult('enhance', 0);
            $request->addResult('error', 'SessionLog unavailable');
            $request->setStatusDone();
            return;
        }
        my $set = $request->getParam('enhance');
        if (defined $set && $set ne '') {
            Plugins::MaterialSkin::SessionLog::setEnhanceEnabled($set);
        }
        my $info = Plugins::MaterialSkin::SessionLog::storeInfo();
        $request->addResult('enhance', $info->{enhance} ? 1 : 0);
        $request->addResult('backend', $info->{backend} // 'none');
        $request->addResult('path', $info->{path} // '');
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'sessions-clear') {
        eval { require Plugins::MaterialSkin::SessionLog; };
        my $ok = 0;
        eval { $ok = Plugins::MaterialSkin::SessionLog::clearAll() ? 1 : 0; };
        $request->addResult('cleared', $ok);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'player-presets') {
        # Native Material UI for LMS Presets Editor (Squeezebox hardware buttons).
        # part:slots  — 10 slots only (fast; editor placeholders hydrate on this)
        # part:options — picker sources (favorites / playlists / …)
        # default / part:all — both (compat)
        my $playerId = $request->getParam('player') || $request->getParam('player_id') || '';
        my $client = $playerId ? Slim::Player::Client::getClient($playerId) : undef;
        unless ($client) {
            $request->addResult('error', 'no_player');
            $request->setStatusDone();
            return;
        }
        my $part = lc($request->getParam('part') // '');
        $part = 'all' unless $part eq 'slots' || $part eq 'options';
        my $want_slots   = $part ne 'options';
        my $want_options = $part ne 'slots';

        my $cprefs = preferences('server')->client($client);
        my $presets = $cprefs->get('presets') || [];
        for my $i (0 .. 9) {
            $presets->[$i] ||= { URL => '', text => '', type => 'audio' };
            $presets->[$i]{URL}  //= '';
            $presets->[$i]{text} //= '';
            $presets->[$i]{type} //= 'audio';
        }

        my $isWiim = 0;
        eval {
            if (Slim::Utils::PluginManager->isEnabled('Plugins::WiimIntegration::Plugin')) {
                $isWiim = Plugins::WiimIntegration::Plugin::isWiimPlayer($client) ? 1 : 0;
            }
        };
        $request->addResult('player_id', $client->id());
        $request->addResult('player_name', $client->name() // '');
        $request->addResult('is_wiim', $isWiim);

        if ($want_slots) {
            my $cnt = 0;
            for my $i (0 .. 9) {
                my $p = $presets->[$i];
                my $url = $p->{URL} // $p->{url} // '';
                my $text = $p->{text} // '';
                $request->addResultLoop('presets_loop', $cnt, 'index', $i + 1);
                $request->addResultLoop('presets_loop', $cnt, 'text', $text);
                $request->addResultLoop('presets_loop', $cnt, 'url', $url);
                $request->addResultLoop('presets_loop', $cnt, 'type', $p->{type} // 'audio');
                $request->addResultLoop('presets_loop', $cnt, 'shuffle', 0 + ($p->{shuffle} // 0));
                $request->addResultLoop('presets_loop', $cnt, 'repeat', 0 + ($p->{repeat} // 0));
                if (length $url) {
                    my $meta = _materialEnrichItemMeta($text, $url, $p);
                    my $icon = _materialPickBestIcon(
                        $meta->{icon},
                        _materialResolveUrlIcon($url),
                        _materialSpottyCover($url),
                    );
                    $request->addResultLoop('presets_loop', $cnt, 'icon', $icon) if $icon;
                    if ($meta->{title} && $meta->{title} ne $text) {
                        $request->addResultLoop('presets_loop', $cnt, 'text', $meta->{title});
                    }
                    $request->addResultLoop('presets_loop', $cnt, 'source', $meta->{source}) if $meta->{source};
                    $request->addResultLoop('presets_loop', $cnt, 'type', $meta->{type}) if $meta->{type};
                    $request->addResultLoop('presets_loop', $cnt, 'artist', $meta->{artist}) if $meta->{artist};
                    $request->addResultLoop('presets_loop', $cnt, 'album', $meta->{album}) if $meta->{album};
                }
                $cnt++;
            }
            $request->addResult('count', $cnt);
        }

        if ($want_options) {
            my $playlistOptions = [];
            eval {
                require Slim::Utils::Alarm;
                $playlistOptions = Slim::Utils::Alarm->getPlaylists($client) || [];
            };
            my $iconByUrl = _materialPresetIconMap($client);
            my $ocnt = 0;
            my @optionsBuf;
            foreach my $cat (@$playlistOptions) {
                next unless $cat && ref $cat eq 'HASH';
                my $items = $cat->{items} || [];
                next unless @$items;
                my $typeLabel = $cat->{type} // '';
                my @catBuf;
                foreach my $it (@$items) {
                    next unless $it;
                    my $url = $it->{url} // $it->{URL} // '';
                    my $rawTitle = $it->{title} // $it->{name} // $it->{text} // '';
                    next unless length $rawTitle;
                    my $meta = _materialEnrichItemMeta($rawTitle, $url, $it);
                    my $icon = _materialPickBestIcon(
                        $it->{icon}, $it->{image}, $it->{cover}, $it->{artwork_url},
                        $meta->{icon},
                        (length $url ? $iconByUrl->{$url} : undef),
                        (length $url ? _materialResolveUrlIcon($url) : undef),
                        (length $url ? _materialSpottyCover($url) : undef),
                    );
                    my $title = $meta->{title} // $rawTitle;
                    push @catBuf, {
                        category => $typeLabel,
                        title    => $title,
                        url      => $url // '',
                        icon     => $icon,
                        source   => $meta->{source} || '',
                        type     => $meta->{type} || '',
                        artist   => $meta->{artist} || '',
                        album    => $meta->{album} || '',
                        _sort    => lc($title),
                    };
                }
                @catBuf = sort { $a->{_sort} cmp $b->{_sort} } @catBuf;
                push @optionsBuf, @catBuf;
            }
            foreach my $o (@optionsBuf) {
                $request->addResultLoop('options_loop', $ocnt, 'category', $o->{category});
                $request->addResultLoop('options_loop', $ocnt, 'title', $o->{title});
                $request->addResultLoop('options_loop', $ocnt, 'url', $o->{url});
                if ($o->{icon}) {
                    $request->addResultLoop('options_loop', $ocnt, 'icon', $o->{icon});
                }
                if ($o->{source}) {
                    $request->addResultLoop('options_loop', $ocnt, 'source', $o->{source});
                }
                if ($o->{type}) {
                    $request->addResultLoop('options_loop', $ocnt, 'type', $o->{type});
                }
                if ($o->{artist}) {
                    $request->addResultLoop('options_loop', $ocnt, 'artist', $o->{artist});
                }
                if ($o->{album}) {
                    $request->addResultLoop('options_loop', $ocnt, 'album', $o->{album});
                }
                $ocnt++;
            }
            $request->addResult('options', $ocnt);
        }

        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'player-presets-set') {
        my $playerId = $request->getParam('player') || $request->getParam('player_id') || '';
        my $client = $playerId ? Slim::Player::Client::getClient($playerId) : undef;
        unless ($client) {
            $request->addResult('ok', 0);
            $request->addResult('error', 'no_player');
            $request->setStatusDone();
            return;
        }
        my $raw = $request->getParam('presets') // $request->getParam('json') // '';
        my $list;
        eval {
            require JSON::XS::VersionOneAndTwo;
            $list = decode_json($raw) if length $raw;
        };
        if ($@ || ref $list ne 'ARRAY') {
            $request->addResult('ok', 0);
            $request->addResult('error', 'bad_json');
            $request->setStatusDone();
            return;
        }
        my $out = [];
        for my $i (0 .. 9) {
            my $p = $list->[$i] || {};
            my $url = $p->{url} // $p->{URL} // '';
            my $text = $p->{text} // $p->{title} // '';
            $text = '' if !length $url;
            my $shuffle = $p->{shuffle} // 0;
            my $repeat  = $p->{repeat} // 0;
            $shuffle = 0 if $shuffle !~ /^[012]$/;
            $repeat  = 0 if $repeat  !~ /^[012]$/;
            $out->[$i] = {
                URL     => $url,
                text    => $text,
                type    => $p->{type} // 'audio',
                shuffle => 0 + $shuffle,
                repeat  => 0 + $repeat,
            };
        }
        preferences('server')->client($client)->set('presets', $out);
        $request->addResult('ok', 1);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'sessions-context') {
        # Controller context hint (playlist / radio / podcast / random) for a player
        eval { require Plugins::MaterialSkin::SessionLog; };
        if ($@ || !Plugins::MaterialSkin::SessionLog::isEnhanceEnabled()) {
            $request->addResult('ok', 0);
            $request->setStatusDone();
            return;
        }
        my $playerId = $request->getParam('player') || $request->getParam('player_id') || '';
        my $type = $request->getParam('type') || '';
        my $id = $request->getParam('id') || '';
        my $title = $request->getParam('title') || '';
        my $url = $request->getParam('url') || '';
        my $image = $request->getParam('image') || '';
        my $ok = Plugins::MaterialSkin::SessionLog::setContext($playerId, $type, $id, $title, $url, $image);
        $request->addResult('ok', $ok ? 1 : 0);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'player-list') {
        main::DEBUGLOG && $log->debug("Get player list");
        my $now = time();
        my $cnt = 0;

        my %eventTimeStamps = (
            _ts_currentSong => 1,
            _ts_maxBitrate => 1,
            _ts_model => 1,
            _ts_modelName => 1,
            _ts_playername => 1,
            _ts_power => 1,
            _ts_repeat => 1,
            _ts_shuffle => 1,
            _ts_volume => 1,
        );

        foreach my $clientPrefs ($serverprefs->allClients) {
            my $id = $clientPrefs->{clientid};
            my $client = Slim::Player::Client::getClient($id);
            my $clientPrefs = Slim::Utils::Prefs::Client->new($serverprefs, $id, 'nomigrate');
            my $name = $clientPrefs->get('playername');
            my $model = $client ? $client->model : $clientPrefs->get('model');

            my $ts = 0;
            foreach (keys %{ $clientPrefs->{prefs} }) {
                next unless $eventTimeStamps{$_};
                $ts = max($ts, $clientPrefs->{prefs}->{$_});
            }

            # check potential saved queue/playlist
            my $playlistId = $id;
            $playlistId =~ s/://g;
            my $playlistPath = catfile(scalar Slim::Utils::OSDetect::dirsFor('prefs'), "clientplaylist_$playlistId.m3u");
            my @stat = stat $playlistPath;
            $ts = max($ts, $stat[9]) if scalar @stat;

            if (!$client && ($now - $ts) > MAX_PLAYER_AGE) {
                next;
            }

            $request->addResultLoop("players_loop", $cnt, "id", $id);
            $request->addResultLoop("players_loop", $cnt, "name", $name);
            $request->addResultLoop("players_loop", $cnt, "model", $model);
            $request->addResultLoop("players_loop", $cnt, "ts", $ts);
            $request->addResultLoop("players_loop", $cnt, "connected", $client ? 1 : 0);
            $cnt+=1;
        }
        main::DEBUGLOG && $log->debug("Player list finished");
        $request->setStatusDone();
        return;
    }

    $request->setStatusBadParams();
}

sub _handleHomeExtraCmd {
    my $request = shift;
    $request->setStatusProcessing();
    my $index = $request->getParam('_p2'); # _index
    my $count = $request->getParam('count');
    if (!$count) {
        $count = $request->getParam('_p3'); # _quantity (count)
    }
    my $libId = $request->getParam('library_id');
    my $userId = $request->getParam('user_id');
    
    $index = 0 unless $index;
    $count = NUM_HOME_ITEMS unless $count;

    my @albumsorts = ();
    if (!$count || $count<NUM_HOME_ITEMS) {
        $count = NUM_HOME_ITEMS;
    }
    if ($request->getParam('new')) {
        push(@albumsorts, "new");
    }
    if ($request->getParam('playcount')) {
        push(@albumsorts, "playcount");
    }
    if ($request->getParam('recentlyplayed')) {
        push(@albumsorts, "recentlyplayed");
    }
    if ($request->getParam('random')) {
        push(@albumsorts, "random");
    }
    if ($request->getParam('changed')) {
        push(@albumsorts, "changed");
    }
    if ($request->getParam('popular')) {
        push(@albumsorts, "popular");
    }

    my @artistsorts = ();
    if ($request->getParam('artists_new')) {
        push(@artistsorts, "new");
    }
    if ($request->getParam('artists_playcount')) {
        push(@artistsorts, "playcount");
    }
    if ($request->getParam('artists_recentlyplayed')) {
        push(@artistsorts, "recentlyplayed");
    }
    if ($request->getParam('artists_popular')) {
        push(@artistsorts, "popular");
    }

    $request->addResult("material_home", 1);
    if (scalar(@albumsorts)>0) {
        my $total = 0;
        foreach my $srt ( @albumsorts ) {
            my $isRandom = $srt eq "random" ? 1 : 0;
            my $reqCount = $isRandom ? 300 : $count;
            my @cmd = ("albums", $index, $reqCount, "tags:aajlqswyKSS24WE", "sort:${srt}");
            if ($libId) {
                push(@cmd, "library_id:${libId}");
            }
            if ($userId) {
                push(@cmd, "user_id:${userId}");
            }
            my $req = Slim::Control::Request::executeRequest(undef, \@cmd);
            my $cnt = 0;
            foreach my $item ( @{ $req->getResult('albums_loop') || [] } ) {
                if ($cnt<$reqCount) {
                    _addExtraHomeItem($request, ${srt}, $item, $cnt, $total);
                    $cnt+=1;
                    $total+=1;
                }
            }
            $request->addResult("material_home_${srt}_loop_len", $req->getResult('count'));
        }
    }
    if (scalar(@artistsorts)>0) {
        my $total = 0;
        my @roles;
        if ($serverprefs->get('useUnifiedArtistsList')) {
            @roles = Slim::Schema::Contributor->activeContributorRoles(1);
        } else {
            @roles = Slim::Schema::Contributor->contributorRoles();
        }
        my $rolesParam = "role_id:" . join(',', @roles);
        foreach my $srt ( @artistsorts ) {
            my @cmd = ("artists", $index, $count, "tags:4s", "sort:${srt}", "include_online_only_artists:1", $rolesParam);
            if ($libId) {
                push(@cmd, "library_id:${libId}");
            }
            if ($userId) {
                push(@cmd, "user_id:${userId}");
            }
            my $req = Slim::Control::Request::executeRequest(undef, \@cmd);
            my $cnt = 0;
            foreach my $item ( @{ $req->getResult('artists_loop') || [] } ) {
                if ($cnt<$count) {
                    _addExtraHomeItem($request, "artists_${srt}", $item, $cnt, $total);
                    $cnt+=1;
                    $total+=1;
                }
            }
            $request->addResult("material_home_artists_${srt}_loop_len", $req->getResult('count'));
        }
    }
    if ($request->getParam('radios')) {
        my @cmd = ("material-skin-query", "radios", $index, $count+1);
        if ($userId) {
            push(@cmd, "user_id:${userId}");
        }
        my $req = Slim::Control::Request::executeRequest(undef, \@cmd);
        my $cnt = 0;
        foreach my $item ( @{ $req->getResult('radios_loop') || [] } ) {
            if ($cnt<$count) {
                _addExtraHomeItem($request, "radios", $item, $cnt, undef);
            }
            $cnt+=1;
        }
        $request->addResult("material_home_radios_loop_len", $cnt);
    }
    if ($request->getParam('favorites')) {
        my @cmd = ("favorites", "items", $index, $count, "menu:favorites", "menu:1");
        if ($userId) {
            push(@cmd, "user_id:${userId}");
        }
        my $req = Slim::Control::Request::executeRequest(undef, \@cmd);
        $request->addResult("material_home_favorites_obj", $req->getResults());
    }
    if ($request->getParam('playlists')) {
        my @cmd = ("material-skin-query", "playlists", $index, $count+1, "tags:suxE", "menu:1");
        if ($userId) {
            push(@cmd, "user_id:${userId}");
        }
        my $req = Slim::Control::Request::executeRequest(undef, \@cmd);
        my $cnt = 0;
        foreach my $item ( @{ $req->getResult('playlists_loop') || [] } ) {
            if ($cnt<$count) {
                _addExtraHomeItem($request, "playlists", $item, $cnt, undef);
                $cnt+=1;
            }
        }
        $request->addResult("material_home_playlists_loop_len", $req->getResult('count'));
    }

    my $others = [ grep { $_ } map { getHomeExtra($_) } keys %{$request->getParamsCopy()} ];
    if (scalar @$others) {
        # process other home items asynchronously and in parallel - they might be doing online lookups
        Async::Util::amap(
            inputs => $others,
            action => sub {
                my ($extra, $acb) = @_;
                my $id = $extra->{id};

                my $args = { 
                    index    => $index,
                    quantity => $extra->{count} && $extra->{count} > $count ? $extra->{count} : $count,
                };
                $args->{user_id} = $userId if $userId;
                my $features = $request->getParam('features');
                $args->{features} = $features if $features;

                $extra->{handler}->($request->client, sub {
                    $acb->({ $id => (shift || []) });
                }, $args); 
            },
            cb => sub {
                my ($resultsList, $err) = @_;
                my $results = {};

                $log->error($err) if $err;

                my $otherExists = { map { $_->{id} => 1 } @$others };

                foreach my $result (@$resultsList) {
                    my ($id, $res) = each %{$result};

                    if ($otherExists->{$id}) {
                        $request->addResult("material_home_${id}_obj", $res);
                    }
                }

                $request->setStatusDone();
            }
        );

        # we have to wait for the async processing to finish
        return;
    }

    $request->setStatusDone();
}

sub _contextStatsHomeEnabled {
    return Slim::Utils::PluginManager->isEnabled('Plugins::ContextStats::Plugin') ? 1 : 0;
}

# Prefer Alternative Play Count (more accurate "true listen" stats) when available.
# Table: alternativeplaycount (playCount, lastPlayed, skipCount, dynPSval, urlmd5, url)
# Fall back to LMS tracks_persistent when APC is not installed / table missing.
sub _contextStatsHomeApcEnabled {
    return Slim::Utils::PluginManager->isEnabled('Plugins::AlternativePlayCount::Plugin') ? 1 : 0;
}

# APC lives in the attached persist DB — not listed in main.sqlite_master.
# Probe with a real SELECT (empty table still succeeds; missing table throws).
sub _contextStatsHomeApcTableUsable {
    return 0 unless _contextStatsHomeApcEnabled();
    my $ok = 0;
    eval {
        my $dbh = Slim::Schema->dbh;
        $dbh->do("SELECT url FROM alternativeplaycount LIMIT 1");
        $ok = 1;
    };
    return $ok ? 1 : 0;
}

sub _contextStatsHomeStatsTable {
    return _contextStatsHomeApcTableUsable() ? 'alternativeplaycount' : 'tracks_persistent';
}

sub _contextStatsHomeUsingApc {
    return _contextStatsHomeStatsTable() eq 'alternativeplaycount' ? 1 : 0;
}

sub _contextStatsHomeAddCard {
    my ($request, $cnt, $card) = @_;
    foreach my $key (keys %{$card}) {
        $request->addResultLoop('cards_loop', $cnt, $key, $card->{$key});
    }
}

# Extract Spotify playlist id from card fields (session URL or Spotty library URL).
sub _contextStatsHomeSpotifyPlaylistId {
    my ($card) = @_;
    return '' unless $card && ref $card eq 'HASH';
    for my $s (
        $card->{play_param2},
        $card->{play_param3},
        $card->{id},
        $card->{title},
        $card->{image},
    ) {
        next unless defined $s && length $s;
        return lc($1) if $s =~ m{spotify:playlist:([A-Za-z0-9]+)}i;
        return lc($1) if $s =~ m{spotify://playlist[:/]([A-Za-z0-9]+)}i;
        return lc($1) if $s =~ m{open\.spotify\.com/playlist/([A-Za-z0-9]+)}i;
    }
    return '';
}

# Normalised title for playlist dedupe (strip Spotify prefix / punctuation).
sub _contextStatsHomePlaylistTitleKey {
    my ($title) = @_;
    $title = '' unless defined $title;
    $title = lc($title);
    $title =~ s/^\s*spotify\s*:\s*//i;
    $title =~ s/[^a-z0-9]+//g;
    return $title;
}

sub _contextStatsHomePlaylistImage {
    my ($playlistName, $cover) = @_;
    # Spotty stores playlist artwork as a remote URL on the playlist track row.
    if (defined $cover && $cover ne '') {
        if ($cover =~ m{^https?://}i) {
            return '/imageproxy/' . URI::Escape::uri_escape_utf8($cover) . '/image_150x150_f';
        }
        return $cover if $cover =~ m{^/};
    }
    return '/material/playlists/' . URI::Escape::uri_escape_utf8($playlistName // '') . '/image_150x150_f';
}

sub _contextStatsHomePlaylistDisplayTitle {
    my ($title) = @_;
    $title = '' unless defined $title;
    # Spotty importer prefixes titles with "Spotify : ".
    $title =~ s/^\s*Spotify\s*:\s*//i;
    # Normalise fancy dashes that sometimes mojibake in older clients.
    $title =~ s/\x{2013}|\x{2014}|–|—/-/g;
    $title =~ s/^\s+|\s+$//g;
    return $title;
}

sub _contextStatsHomeAlbumImage {
    my ($coverid) = @_;
    $coverid = 0 if !defined $coverid || $coverid eq '';
    return "/music/${coverid}/cover_150x150_f";
}

sub _contextStatsHomeResumeTrack {
    my ($dbh, $albumId) = @_;
    # Match album ranking: tracks_persistent only (stable, full LMS history).
    my $sql = $dbh->prepare(qq{
        SELECT t.url FROM tracks t
        LEFT JOIN tracks_persistent tp ON tp.urlmd5 = t.urlmd5
        WHERE t.album = ? AND COALESCE(tp.playCount, 0) = 0
        ORDER BY t.disc, t.tracknum
        LIMIT 1
    });
    $sql->execute($albumId);
    if (my $result = $sql->fetchall_arrayref({})) {
        return $result->[0]->{url} if ref $result && scalar @$result;
    }
    return undef;
}

sub _contextStatsHomePlaylistCard {
    my ($row) = @_;
    my $rawTitle = $row->{title} // '';
    my $url = $row->{url} // '';
    my $title = _contextStatsHomePlaylistDisplayTitle($rawTitle);
    my $isSpotify = ($url =~ m{^spotify:playlist:}i) ? 1 : 0;
    # Spotty sometimes imports "Spotify : " with an empty name — keep a usable label.
    if (!length $title) {
        if ($isSpotify && $url =~ m{spotify:playlist:([A-Za-z0-9]+)}i) {
            $title = 'Spotify playlist';
        }
        else {
            return;
        }
    }

    my $plays = int($row->{playcount} || 0);
    # playcount = distinct member tracks with recent plays (see CONTEXT_STATS_USAGE_WINDOW).
    # Keep subtitle ASCII-safe for JSONRPC clients with mixed encodings.
    my $subtitle = $isSpotify
        ? ("Spotify - $plays recent")
        : ("$plays recent");

    return {
        id       => 'cstats.playlist.' . $row->{id},
        type     => 'playlist',
        title    => $title,
        subtitle => $subtitle,
        image    => _contextStatsHomePlaylistImage($rawTitle, $row->{cover}),
        progress => 0,
        play_cmd => 'playlistcontrol',
        play_param1 => 'cmd:load',
        play_param2 => 'playlist_id:' . $row->{id},
        is_spotify  => $isSpotify,
        playcount   => $plays,
        last_played => int($row->{last_played} || 0),
    };
}

# Rank playlists by how many distinct member tracks were played recently.
# Important details:
#  - Exclude Bookmark/. hidden playlists in SQL (they used to fill LIMIT and
#    starve real/Spotify playlists after post-filtering).
#  - Always include tracks_persistent for ranking; APC under-reports Spotify
#    listens (often 0–1 recent spotify tracks) so APC-only ranking looked empty.
#  - Spotty may store playlist_track as spotify://track:… vs spotify:track:…
sub _contextStatsHomePlaylistRows {
    my ($dbh, $limit, $scope) = @_;
    $scope = 'all' unless defined $scope;
    $limit = int($limit || 0);
    $limit = 8 if $limit < 1;
    $limit = 24 if $limit > 24;

    my $useApc = _contextStatsHomeApcTableUsable() ? 1 : 0;
    my $window = CONTEXT_STATS_USAGE_WINDOW;
    my @ranked = ();

    # Retry with a wider window if the primary window has no usable playlists.
    for my $attempt (0, 1) {
        my $cutoff = int(time() - $window);
        my $rankSql;
        if ($useApc) {
            # Hybrid: match on LMS persistent counts OR APC true-listens.
            # Alias must NOT be "playcount" — that collides with tp/apc.playCount
            # under SQLite's case-insensitive HAVING resolution (ambiguous column).
            $rankSql = qq{
                SELECT pt.playlist,
                       COUNT(DISTINCT pt.track) AS member_plays,
                       MAX(CASE
                            WHEN COALESCE(tp.lastPlayed, 0) >= COALESCE(apc.lastPlayed, 0)
                                THEN COALESCE(tp.lastPlayed, 0)
                            ELSE COALESCE(apc.lastPlayed, 0)
                       END) AS last_played
                FROM playlist_track pt
                JOIN tracks pl ON pl.id = pt.playlist
                    AND pl.content_type = 'ssp'
                    AND COALESCE(pl.title, '') NOT LIKE 'Bookmark%'
                    AND COALESCE(pl.title, '') NOT LIKE '.%'
                LEFT JOIN tracks_persistent tp ON (
                       tp.url = pt.track
                    OR tp.url = REPLACE(pt.track, 'spotify://', 'spotify:')
                )
                LEFT JOIN alternativeplaycount apc ON (
                       apc.url = pt.track
                    OR apc.url = REPLACE(pt.track, 'spotify://', 'spotify:')
                )
                WHERE COALESCE(tp.lastPlayed, 0) >= $cutoff
                   OR COALESCE(apc.lastPlayed, 0) >= $cutoff
                GROUP BY pt.playlist
                HAVING COUNT(DISTINCT pt.track) >= ${\CONTEXT_STATS_PLAYLIST_MIN_RECENT}
                -- Recency first: "what you listened to lately", not "largest playlist
                -- that happens to share tracks with albums you played".
                ORDER BY last_played DESC, member_plays DESC
                LIMIT 80
            };
        }
        else {
            $rankSql = qq{
                SELECT pt.playlist,
                       COUNT(DISTINCT pt.track) AS member_plays,
                       MAX(tp.lastPlayed) AS last_played
                FROM playlist_track pt
                JOIN tracks pl ON pl.id = pt.playlist
                    AND pl.content_type = 'ssp'
                    AND COALESCE(pl.title, '') NOT LIKE 'Bookmark%'
                    AND COALESCE(pl.title, '') NOT LIKE '.%'
                JOIN tracks_persistent tp ON (
                       tp.url = pt.track
                    OR tp.url = REPLACE(pt.track, 'spotify://', 'spotify:')
                )
                WHERE COALESCE(tp.lastPlayed, 0) >= $cutoff
                GROUP BY pt.playlist
                HAVING COUNT(DISTINCT pt.track) >= ${\CONTEXT_STATS_PLAYLIST_MIN_RECENT}
                ORDER BY last_played DESC, member_plays DESC
                LIMIT 80
            };
        }

        @ranked = ();
        eval {
            my $sth = $dbh->prepare($rankSql);
            $sth->execute();
            while (my $r = $sth->fetchrow_arrayref) {
                push @ranked, {
                    id          => $r->[0],
                    playcount   => int($r->[1] || 0),
                    last_played => int($r->[2] || 0),
                };
            }
            $sth->finish;
        };
        if ($@) {
            $log->error("context-stats-home playlist rank SQL: $@");
            # Fall back once without the APC side of the hybrid join.
            if ($useApc) {
                $useApc = 0;
                redo;
            }
            return [];
        }
        last if @ranked;
        # Second pass: wider window when the primary window is quiet.
        $window = CONTEXT_STATS_USAGE_WINDOW_FALLBACK if $attempt == 0;
    }
    return [] unless @ranked;

    # Step 2: load ssp playlist metadata and apply scope filters.
    my $metaSth;
    eval {
        $metaSth = $dbh->prepare(q{
            SELECT id, title, url, cover, content_type
            FROM tracks WHERE id = ?
        });
    };
    if ($@ || !$metaSth) {
        $log->error("context-stats-home playlist meta prepare: $@");
        return [];
    }

    my @rows = ();
    foreach my $rank (@ranked) {
        last if scalar @rows >= $limit;
        my $id = $rank->{id};
        next unless $id;

        my ($pid, $title, $url, $cover, $ctype);
        eval {
            $metaSth->execute($id);
            ($pid, $title, $url, $cover, $ctype) = $metaSth->fetchrow_array;
        };
        next if $@ || !defined $pid;
        next unless defined $ctype && $ctype eq 'ssp';
        # Allow empty display title for Spotify (card builder supplies a fallback).
        next unless defined $title;
        next if $title =~ /^\./;
        next if $title =~ /^Bookmark/i;

        if ($scope eq 'spotify') {
            next unless defined $url && $url =~ m{^spotify:playlist:}i;
        }
        elsif ($scope eq 'local') {
            next if defined $url && $url =~ m{^spotify:playlist:}i;
        }

        push @rows, {
            id          => $pid,
            title       => $title,
            url         => $url // '',
            cover       => $cover,
            playcount   => $rank->{playcount},
            last_played => $rank->{last_played},
        };
    }
    eval { $metaSth->finish; };

    return \@rows;
}

sub _contextStatsHomeTopPlaylists {
    my ($dbh, $limit) = @_;
    $limit = int($limit || 0);
    $limit = 4 if $limit < 1;

    my $spottyEnabled = Slim::Utils::PluginManager->isEnabled('Plugins::Spotty::Plugin') ? 1 : 0;

    # Fetch extras so Spotty/local balancing still has candidates after filters.
    my $fetchN = $limit + 12;
    my @all = ();
    eval {
        foreach my $row (@{ _contextStatsHomePlaylistRows($dbh, $fetchN, 'all') }) {
            my $card = _contextStatsHomePlaylistCard($row);
            push @all, $card if $card;
        }
    };
    if ($@) {
        $log->error("context-stats-home playlists: $@");
        return ();
    }

    # If the mixed pass returned nothing, try Spotify-only then local-only.
    if (!@all && $spottyEnabled) {
        eval {
            foreach my $row (@{ _contextStatsHomePlaylistRows($dbh, $fetchN, 'spotify') }) {
                my $card = _contextStatsHomePlaylistCard($row);
                push @all, $card if $card;
            }
        };
    }
    if (!@all) {
        eval {
            foreach my $row (@{ _contextStatsHomePlaylistRows($dbh, $fetchN, 'local') }) {
                my $card = _contextStatsHomePlaylistCard($row);
                push @all, $card if $card;
            }
        };
    }

    # Keep reality order: most recently touched playlists first (not forced Spotify half).
    @all = sort {
        ($b->{last_played} || 0) <=> ($a->{last_played} || 0)
            || ($b->{playcount} || 0) <=> ($a->{playcount} || 0)
    } @all;

    my @cards = splice(@all, 0, $limit);

    foreach my $card (@cards) {
        delete $card->{is_spotify};
        delete $card->{playcount};
        # last_played kept for final recency merge
    }
    return @cards;
}

sub _contextStatsHomeContinueAlbums {
    my ($dbh, $limit) = @_;
    my @cards = ();
    my $minPlayed = CONTEXT_STATS_ALBUM_MIN_PLAYED_TRACKS;
    my $minRecentComplete = CONTEXT_STATS_ALBUM_MIN_RECENT_COMPLETE;

    # Always rank albums on tracks_persistent (LMS play history). APC alone
    # under-reports "true listens" and made most real albums disappear.
    # Try primary window, then a longer fallback.
    for my $window (CONTEXT_STATS_USAGE_WINDOW, CONTEXT_STATS_USAGE_WINDOW_FALLBACK) {
        my $cutoff = time() - $window;
        my $softRecent = time() - (3 * 24 * 3600);
        my $sql = $dbh->prepare(qq{
            SELECT a.id, a.title,
                   COALESCE(a.artwork, (
                       SELECT t2.coverid FROM tracks t2
                       WHERE t2.album = a.id AND t2.coverid IS NOT NULL AND t2.coverid != ''
                       LIMIT 1
                   )) AS coverid,
                   c.name AS artist,
                   COUNT(DISTINCT t.id) AS trackcount,
                   COUNT(DISTINCT CASE WHEN COALESCE(tp.playCount, 0) > 0 THEN t.id END) AS playedcount,
                   COUNT(DISTINCT CASE WHEN COALESCE(tp.lastPlayed, 0) >= ? THEN t.id END) AS recentcount,
                   MAX(COALESCE(tp.lastPlayed, 0)) AS album_lastplayed,
                   SUM(COALESCE(tp.playCount, 0)) AS totalplays
            FROM albums a
            JOIN contributors c ON c.id = a.contributor
            JOIN tracks t ON t.album = a.id AND COALESCE(t.audio, 1) = 1
            LEFT JOIN tracks_persistent tp ON tp.urlmd5 = t.urlmd5
            GROUP BY a.id
            HAVING album_lastplayed >= ?
               AND recentcount >= 1
               AND (
                    (trackcount >= 2
                        AND playedcount >= ?
                        AND playedcount < trackcount)
                    OR (trackcount = 1 AND recentcount >= 1)
                    OR (playedcount >= trackcount
                        AND trackcount >= 2
                        AND (recentcount >= ?
                             OR recentcount * 2 >= trackcount))
                    OR (trackcount >= 2
                        AND recentcount >= 1
                        AND album_lastplayed >= ?)
               )
            ORDER BY album_lastplayed DESC, recentcount DESC
            LIMIT ?
        });
        eval {
            $sql->execute($cutoff, $cutoff, $minPlayed, $minRecentComplete, $softRecent, $limit);
        };
        if ($@) {
            $log->error("context-stats-home albums SQL: $@");
            next;
        }
        my $rows = $sql->fetchall_arrayref({});
        next unless $rows && @{$rows};

        foreach my $row (@{$rows}) {
            my $trackcount = $row->{trackcount} || 1;
            my $playedcount = $row->{playedcount} || 0;
            my $recentcount = int($row->{recentcount} || 0);
            my $totalplays = int($row->{totalplays} || 0);
            my $complete = $playedcount >= $trackcount;
            my $progress = $complete ? 1 : ($playedcount / $trackcount);
            my $isSpillover = (!$complete && $playedcount < $minPlayed && $trackcount >= 2);
            if ($isSpillover) {
                $progress = 0;
            }
            my $resumeUrl;
            if (!($complete || $isSpillover)) {
                eval {
                    $resumeUrl = _contextStatsHomeResumeTrack($dbh, $row->{id});
                };
                if ($@) {
                    $log->error("context-stats-home resume track: $@");
                    $resumeUrl = undef;
                }
            }
            my $artist = $row->{artist} || '';
            my $subtitle = $artist;
            if ($complete) {
                if ($totalplays > 0) {
                    $subtitle = length($artist)
                        ? "$artist - $totalplays plays"
                        : "$totalplays plays";
                }
                else {
                    $subtitle = length($artist)
                        ? "$artist - recent"
                        : "recent";
                }
            }
            elsif ($playedcount > 0 && !$isSpillover) {
                $subtitle = length($artist)
                    ? "$artist - $playedcount/$trackcount"
                    : "$playedcount/$trackcount";
            }
            my %card = (
                id          => 'cstats.album.' . $row->{id},
                type        => 'album',
                title       => $row->{title} // '',
                subtitle    => $subtitle // '',
                image       => _contextStatsHomeAlbumImage($row->{coverid}),
                progress    => $progress,
                last_played => int($row->{album_lastplayed} || 0),
            );
            # Always use album load — more reliable than resume URL schemes.
            # (Resume-from-first-unplayed can be re-enabled later if desired.)
            $card{play_cmd}    = 'playlistcontrol';
            $card{play_param1} = 'cmd:load';
            $card{play_param2} = 'album_id:' . $row->{id};
            push @cards, \%card;
        }
        last if @cards;
    }
    main::INFOLOG && $log->info("context-stats-home albums: " . scalar(@cards) . " cards");
    return @cards;
}

sub _contextStatsHomePodcastLastActivity {
    my ($url) = @_;
    return 0 unless $url;

    my $bare = $url;
    $bare =~ s{^podcast://}{}i;
    my $wrapped = ($url =~ m{^podcast://}i) ? $url : ('podcast://' . $url);

    my $last = 0;
    my $stats = _contextStatsHomeStatsTable();
    eval {
        my $dbh = Slim::Schema->dbh;
        my $sth = $dbh->prepare_cached(qq{
            SELECT MAX(COALESCE(tp.lastPlayed, 0)) AS lastplayed
            FROM $stats tp
            WHERE tp.url IN (?, ?, ?)
        });
        $sth->execute($url, $bare, $wrapped);
        if (my $row = $sth->fetchrow_hashref) {
            $last = int($row->{lastplayed} || 0);
        }
    };
    return $last;
}

sub _contextStatsHomeContinuePodcasts {
    my ($limit) = @_;
    my @cards = ();
    return @cards unless $limit && $limit > 0;
    return @cards unless Slim::Utils::PluginManager->isEnabled('Slim::Plugin::Podcast::Plugin');

    my $podPrefs = preferences('plugin.podcast');
    my $recent = $podPrefs->get('recent') || [];
    my $cache = Slim::Utils::Cache->new();
    my $cutoff = time() - CONTEXT_STATS_PODCAST_MAX_AGE;
    # reverse() is most-recent-first (LRU). Cap how deep we walk so stale
    # entries without lastPlayed cannot crowd out fresher playlists.
    my $maxScan = 30;
    my $scanned = 0;
    my %seen = ();

    # 1) Unfinished episodes (resume) — preferred
    foreach my $item (reverse @{$recent}) {
        last if scalar @cards >= $limit;
        last if ++$scanned > $maxScan;
        next unless $item->{url} && $item->{title};
        next if $seen{$item->{url}}++;
        my $from = $cache->get('podcast-' . $item->{url});
        my $duration = $item->{duration} || 0;
        my $unfinished = $from && $duration > 0 && $from < $duration - 15;

        # Window filter when play history exists
        my $last = _contextStatsHomePodcastLastActivity($item->{url});
        next if $last > 0 && $last < $cutoff;
        # Finished episodes need recent play history; unfinished keep even without it
        # if they sit near the head of the podcast recent list.
        if (!$unfinished) {
            next unless $last >= $cutoff;
        }

        my $image = $item->{cover};
        if ($image && ($image !~ m{^/} && $image !~ m{^https?://})) {
            $image = '/' . $image;
        }
        $image ||= '/html/images/podcast.png';

        my %card = (
            id          => 'cstats.podcast.' . md5_hex($item->{url}),
            type        => 'podcast',
            title       => $item->{title},
            image       => $image,
            play_cmd    => 'playlist',
            play_param1 => 'play',
            last_played => $last || 0,
        );
        if ($unfinished) {
            my $pct = int(($from / $duration) * 100 + 0.5);
            $pct = 1 if $pct < 1;
            $pct = 99 if $pct > 99;
            $card{subtitle} = $pct . '% - Podcast';
            $card{progress} = $from / $duration;
            $card{play_param2} = 'podcast://' . $item->{url} . '{from=' . int($from) . '}';
        }
        else {
            $card{subtitle} = 'Podcast';
            $card{progress} = 0;
            $card{play_param2} = 'podcast://' . $item->{url};
        }
        push @cards, \%card;
    }

    # 2) Also surface episodes that only show up in play history (not in recent cache)
    if (scalar @cards < $limit) {
        eval {
            my $dbh = Slim::Schema->dbh;
            my $stats = _contextStatsHomeStatsTable();
            my $sth = $dbh->prepare(qq{
                SELECT tp.url AS url,
                       MAX(COALESCE(tp.lastPlayed, 0)) AS lastplayed,
                       SUM(COALESCE(tp.playCount, 0)) AS plays
                FROM $stats tp
                WHERE COALESCE(tp.lastPlayed, 0) >= ?
                  AND (
                       tp.url LIKE 'podcast:%'
                    OR tp.url LIKE 'podcast://%'
                  )
                GROUP BY tp.url
                ORDER BY lastplayed DESC
                LIMIT 16
            });
            $sth->execute($cutoff);
            while (my $row = $sth->fetchrow_hashref) {
                last if scalar @cards >= $limit;
                my $url = $row->{url} // '';
                next unless length $url;
                my $bare = $url;
                $bare =~ s{^podcast://}{}i;
                next if $seen{$bare}++ || $seen{$url}++;
                my $title = $bare;
                $title =~ s{^.*/}{};
                $title = URI::Escape::uri_unescape($title) if $title =~ /%/;
                $title = 'Podcast' unless length $title;
                push @cards, {
                    id          => 'cstats.podcast.' . md5_hex($bare),
                    type        => 'podcast',
                    title       => $title,
                    subtitle    => 'Podcast',
                    image       => '/html/images/podcast.png',
                    progress    => 0,
                    play_cmd    => 'playlist',
                    play_param1 => 'play',
                    play_param2 => ($url =~ m{^podcast://}i) ? $url : ('podcast://' . $bare),
                    last_played => int($row->{lastplayed} || 0),
                };
            }
            $sth->finish;
        };
        if ($@) {
            $log->error("context-stats-home podcast history: $@");
        }
    }

    # Prefer unfinished (progress>0), then recency.
    # Keep last_played for the home-strip merge (was deleted too early before).
    @cards = sort {
        my $ap = ($a->{progress} || 0) > 0 ? 0 : 1;
        my $bp = ($b->{progress} || 0) > 0 ? 0 : 1;
        return $ap <=> $bp if $ap != $bp;
        return ($b->{last_played} || 0) <=> ($a->{last_played} || 0);
    } @cards;

    return @cards[0 .. ($limit - 1 > $#cards ? $#cards : $limit - 1)];
}

# Recently played web radios / remote streams from play history (+ favorites metadata).
sub _contextStatsHomeRecentRadios {
    my ($dbh, $limit) = @_;
    my @cards = ();
    return @cards unless $limit && $limit > 0 && $dbh;

    my $cutoff = time() - CONTEXT_STATS_USAGE_WINDOW;
    my $stats = _contextStatsHomeStatsTable();
    my %meta = (); # url => { title, image }

    # Favorites OPML: nice titles/icons for saved stations
    eval {
        if (Slim::Utils::PluginManager->isEnabled('Slim::Plugin::Favorites::Plugin')
            || eval { require Slim::Plugin::Favorites::OpmlFavorites; 1 }) {
            my $feed = Slim::Plugin::Favorites::OpmlFavorites->new(undef)->xmlbrowser(0);
            my @stack = ($feed);
            while (@stack) {
                my $node = shift @stack;
                next unless $node;
                if (ref $node eq 'ARRAY') {
                    push @stack, @{$node};
                    next;
                }
                next unless ref $node eq 'HASH';
                if ($node->{items} && ref $node->{items} eq 'ARRAY') {
                    push @stack, @{$node->{items}};
                }
                my $url = $node->{URL} || $node->{url} || $node->{play} || '';
                next unless length $url && _isRadio($url);
                my $title = $node->{name} || $node->{title} || '';
                my $image = $node->{image} || $node->{icon} || $node->{cover} || '';
                $meta{$url} = { title => $title, image => $image } if length $title || length $image;
            }
        }
    };

    my @rows = ();
    eval {
        # Hybrid LMS persistent + optional APC for stream URLs
        my $sql;
        if (_contextStatsHomeApcTableUsable()) {
            $sql = qq{
                SELECT url, MAX(lastplayed) AS lastplayed, SUM(plays) AS plays FROM (
                    SELECT tp.url AS url,
                           COALESCE(tp.lastPlayed, 0) AS lastplayed,
                           COALESCE(tp.playCount, 0) AS plays
                    FROM tracks_persistent tp
                    WHERE COALESCE(tp.lastPlayed, 0) >= ?
                    UNION ALL
                    SELECT apc.url AS url,
                           COALESCE(apc.lastPlayed, 0) AS lastplayed,
                           COALESCE(apc.playCount, 0) AS plays
                    FROM alternativeplaycount apc
                    WHERE COALESCE(apc.lastPlayed, 0) >= ?
                )
                GROUP BY url
                ORDER BY lastplayed DESC
                LIMIT 80
            };
            my $sth = $dbh->prepare($sql);
            $sth->execute($cutoff, $cutoff);
            while (my $r = $sth->fetchrow_hashref) {
                push @rows, $r;
            }
            $sth->finish;
        }
        else {
            my $sth = $dbh->prepare(qq{
                SELECT tp.url AS url,
                       COALESCE(tp.lastPlayed, 0) AS lastplayed,
                       COALESCE(tp.playCount, 0) AS plays
                FROM $stats tp
                WHERE COALESCE(tp.lastPlayed, 0) >= ?
                ORDER BY lastplayed DESC
                LIMIT 80
            });
            $sth->execute($cutoff);
            while (my $r = $sth->fetchrow_hashref) {
                push @rows, $r;
            }
            $sth->finish;
        }
    };
    if ($@) {
        $log->error("context-stats-home radios: $@");
        return @cards;
    }

    my %seen = ();
    foreach my $row (@rows) {
        last if scalar @cards >= $limit;
        my $url = $row->{url} // '';
        next unless length $url;
        next if $seen{$url}++;
        # Skip library / podcast / app music schemes
        next if $url =~ m{^(file|db|spotify|qobuz|tidal|deezer|wimp|youtube|podcast):}i;
        next unless _isRadio($url) || $url =~ m{^(http|https|mms|rtsp):}i;
        # http(s) music file downloads sometimes land in persistent — skip common audio file URLs
        next if $url =~ m{\.(mp3|flac|m4a|ogg|opus|wav|aiff?)(\?|$)}i
            && $url !~ m{(pls|m3u|xspf|stream|listen|tune|radio|icy)}i
            && !_isRadio($url);

        my $title = '';
        my $image = '';
        if (my $m = $meta{$url}) {
            $title = $m->{title} || '';
            $image = $m->{image} || '';
        }
        # tracks table may hold remote stream titles — but RP etc. often store segment
        # filenames like "4-1.flac"; never surface those as the card title.
        if (!length $title || !length $image || _isAudioFilenameTitle($title)) {
            eval {
                my $urlmd5 = md5_hex($url);
                my $sth = $dbh->prepare_cached(qq{
                    SELECT title, cover, coverid FROM tracks
                    WHERE url = ? OR urlmd5 = ?
                    LIMIT 1
                });
                $sth->execute($url, $urlmd5);
                if (my $tr = $sth->fetchrow_hashref) {
                    if (!length $title || _isAudioFilenameTitle($title)) {
                        my $tt = $tr->{title} || '';
                        $title = $tt if length $tt && !_isAudioFilenameTitle($tt);
                    }
                    if (!length $image) {
                        if ($tr->{cover} && $tr->{cover} =~ m{^https?://}i) {
                            $image = '/imageproxy/' . URI::Escape::uri_escape_utf8($tr->{cover}) . '/image_150x150_f';
                        }
                        elsif ($tr->{coverid}) {
                            $image = "/music/$tr->{coverid}/cover_150x150_f";
                        }
                    }
                }
            };
        }
        my ($rpTitle, $rpSub, $rpImg) = _radioParadiseChannel($url, $title);
        if (defined $rpTitle) {
            $title = $rpTitle;
            $image = $rpImg if $rpImg;
        } else {
            $title = _niceRadioTitle($url, $title);
        }
        if ($image && $image !~ m{^/} && $image !~ m{^https?://}) {
            $image = '/' . $image;
        }
        if ($image && $image =~ m{^https?://}i) {
            $image = '/imageproxy/' . URI::Escape::uri_escape_utf8($image) . '/image_150x150_f';
        }
        $image ||= '/html/images/radio.png';

        my $plays = int($row->{plays} || 0);
        # ASCII separator only (UTF-8 middle-dot can mojibake as "Â·")
        my $subtitle = $rpSub
            ? ($plays > 1 ? "$rpSub - $plays plays" : $rpSub)
            : ($plays > 1 ? "Radio - $plays plays" : 'Radio');

        push @cards, {
            id          => 'cstats.radio.' . md5_hex($url),
            type        => 'radio',
            title       => $title,
            subtitle    => $subtitle,
            image       => $image,
            progress    => 0,
            play_cmd    => 'playlist',
            play_param1 => 'play',
            play_param2 => $url,
            play_param3 => $title,
            last_played => int($row->{lastplayed} || 0),
        };
    }
    return @cards;
}

sub _handleContextStatsHomeCmd {
    my $request = shift;
    # Home swiper requests a buffer pool (paginated 2x2 / 3x2 / 4x2; dismiss pulls from reserve).
    my $count = $request->getParam('count') || 12;
    $count = int($count);
    $count = 32 if $count > 32;
    $count = 4 if $count < 4;
    my $playerId = $request->getParam('player') || $request->getParam('player_id') || '';

    $request->addResult('context_stats', _contextStatsHomeEnabled());
    # Surface whether Alternative Play Count backs ranking / progress / play counts
    $request->addResult('apc_enabled', _contextStatsHomeApcEnabled());
    $request->addResult('stats_source', _contextStatsHomeUsingApc() ? 'apc' : 'lms');
    my $sessionEnhance = 0;
    eval {
        require Plugins::MaterialSkin::SessionLog;
        $sessionEnhance = Plugins::MaterialSkin::SessionLog::isEnhanceEnabled() ? 1 : 0;
    };
    $request->addResult('session_enhance', $sessionEnhance);
    # Master enable is server Material Skin plugin setting (not client Interface menu)
    unless ($prefs->get('contextStatsHome')) {
        $request->addResult('home_enabled', 0);
        $request->addResult('count', 0);
        $request->addResult('items', []);
        $request->setStatusDone();
        return;
    }
    $request->addResult('home_enabled', 1);
    $request->addResult('count', 0);

    my $dbh = Slim::Schema->dbh;
    my @playlists = ();
    my @podcasts = ();
    my @radios = ();
    my @albums = ();
    my @sessions = ();
    my $plErr = '';

    # Fetch generous pools of each type; final order is by real last_played.
    eval { @playlists = _contextStatsHomeTopPlaylists($dbh, $count); };
    if ($@) {
        $plErr = "$@";
        $log->error("context-stats-home playlists: $plErr");
    }
    my $plFound = scalar @playlists;
    eval { @podcasts = _contextStatsHomeContinuePodcasts($count); };
    if ($@) { $log->error("context-stats-home podcasts: $@"); }
    eval { @radios = _contextStatsHomeRecentRadios($dbh, $count); };
    if ($@) { $log->error("context-stats-home radios: $@"); }
    eval { @albums = _contextStatsHomeContinueAlbums($dbh, $count); };
    if ($@) { $log->error("context-stats-home albums: $@"); }

    # Opt-in Material session log: playlist / radio / podcast / random with duration
    if ($sessionEnhance) {
        eval {
            @sessions = Plugins::MaterialSkin::SessionLog::sessionCards(
                $playerId, $count, CONTEXT_STATS_USAGE_WINDOW
            );
            # Fallback wider window if quiet
            if (!@sessions) {
                @sessions = Plugins::MaterialSkin::SessionLog::sessionCards(
                    $playerId, $count, CONTEXT_STATS_USAGE_WINDOW_FALLBACK
                );
            }
        };
        if ($@) { $log->error("context-stats-home sessions: $@"); }
    }

    # --- Reality-first merge ---
    # Session cards fill gaps LMS/APC miss (radio, RP, podcast, playlist duration).
    # Sort everything by last_played, with a soft per-type cap so one type
    # cannot fill the whole strip unless nothing else exists.
    # Prefer session card when same id (sessions listed first).
    # Also collapse Spotty duplicates: same playlist often appears twice —
    # once as session "Spotify" (spotify:playlist:…) and once as LMS-imported
    # library playlist "Playlist" (playlist_id:N) with the same title.
    my %seenId;
    my %seenSpotifyPl;
    my %seenPlaylistTitle;
    my @pool = ();
    foreach my $c (@sessions, @playlists, @podcasts, @radios, @albums) {
        next unless $c && $c->{id};
        next if $seenId{$c->{id}}++;
        if (($c->{type} || '') eq 'playlist') {
            my $spId = _contextStatsHomeSpotifyPlaylistId($c);
            if ($spId ne '' && $seenSpotifyPl{$spId}++) {
                next;
            }
            my $tKey = _contextStatsHomePlaylistTitleKey($c->{title});
            # Length floor avoids collapsing short generic names ("mix", "favs")
            if ($tKey ne '' && length($tKey) >= 8 && $seenPlaylistTitle{$tKey}++) {
                next;
            }
        }
        push @pool, $c;
    }
    @pool = sort {
        ($b->{last_played} || 0) <=> ($a->{last_played} || 0)
    } @pool;

    my $maxPerType = int(($count + 1) / 2); # soft: ≤ half the strip per type
    $maxPerType = 2 if $maxPerType < 2;
    my %typeCount = ();
    my @cards = ();
    my @deferred = ();

    foreach my $c (@pool) {
        my $t = $c->{type} || 'other';
        if (($typeCount{$t} || 0) < $maxPerType) {
            push @cards, $c;
            $typeCount{$t}++;
        }
        else {
            push @deferred, $c;
        }
        last if scalar @cards >= $count;
    }
    while (scalar @cards < $count && @deferred) {
        push @cards, shift @deferred;
    }
    @cards = splice(@cards, 0, $count);

    my $cnt = 0;
    foreach my $card (@cards) {
        # Internal ranking fields only
        delete $card->{last_played};
        delete $card->{is_spotify};
        delete $card->{playcount};
        delete $card->{from_session};
        _contextStatsHomeAddCard($request, $cnt, $card);
        $cnt++;
    }
    $request->addResult('count', $cnt);
    if ($plErr) {
        $log->error("context-stats-home playlists: $plErr");
    }
    if ($plFound < 1) {
        $log->info("context-stats-home: no playlist cards (albums/podcasts/radios may still fill the strip)");
    }

    $request->setStatusDone();
}

sub _addExtraHomeItem {
    my ($request, $id, $item, $cnt, $idmod) = @_;
    my $loop_name = "material_home_${id}_loop";
    foreach my $key (keys(%{$item})) {
        if (defined $idmod) {
            $request->addResultLoop($loop_name, $cnt, "id", $item->{id} . "@" . "idx" . $idmod); # Need unique IDs in case same album in multiple loops!
        }
        if ((!defined $idmod) || $key ne "id") {
            $request->addResultLoop($loop_name, $cnt, ${key}, $item->{$key});
        }
    }

    $request->addResultLoop($loop_name, $cnt, "ihe", 1);
}

sub _isRadio {
    my $url = shift;
    if (defined $url) {
        my @parts = split(/:/, $url);
        my $protocol = shift(@parts);
        if (exists($RADIO_PROTOCOLS{$protocol})) {
            return 1;
        }
    }
    return 0;
}

# Stream segment / file-like titles (e.g. Radio Paradise "4-1.flac") are not station names.
sub _isAudioFilenameTitle {
    my ($title) = @_;
    return 0 unless defined $title && length $title;
    my $t = $title;
    $t =~ s/^\s+|\s+$//g;
    return 1 if $t =~ m{\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?)(\?.*)?$}i;
    return 1 if $t =~ m{^\d+[-_.]\d+\.(flac|mp3|m4a)$}i;
    return 0;
}

# Returns (channelTitle, brandSubtitle, icon) for Radio Paradise URLs, else empty list.
sub _radioParadiseChannel {
    my ($url, $title) = @_;
    $url   //= '';
    $title //= '';
    my $blob = lc("$url $title");
    return unless $blob =~ m{radioparadise|radio\.paradise}i;

    my $slug = '';
    if ($url =~ m{radioparadise\.com/([a-z0-9_-]+)}i) {
        $slug = lc($1);
    } elsif ($url =~ m{radioparadise:/?/?([a-z0-9_-]+)}i) {
        $slug = lc($1);
    } elsif ($url =~ m{[?&#](?:channel|mix|stream)=([a-z0-9_-]+)}i) {
        $slug = lc($1);
    }
    $slug =~ s/[-_]?(flac|aac|mp3|ogg|opus|320|128|64|32|4k|hd)$//i;
    $slug =~ s/^(?:rp|radio[-_]?paradise)[-_]?//i;

    my %map = (
        mellow   => 'Mellow Mix',
        rock     => 'Rock Mix',
        global   => 'Global Mix',
        world    => 'Global Mix',
        eclectic => 'Eclectic Mix',
        main     => 'Main Mix',
        flac     => 'Main Mix',
        aac      => 'Main Mix',
        ''       => 'Main Mix',
    );
    my $channel = $map{$slug};
    if (!$channel && length $slug) {
        if ($slug =~ m{^mellow})   { $channel = 'Mellow Mix'; }
        elsif ($slug =~ m{^rock})  { $channel = 'Rock Mix'; }
        elsif ($slug =~ m{^(?:global|world)}) { $channel = 'Global Mix'; }
        elsif ($slug =~ m{^eclectic}) { $channel = 'Eclectic Mix'; }
        else {
            $channel = join(' ', map { ucfirst($_) } split(/[-_\s]+/, $slug));
            $channel .= ' Mix' if $channel !~ m{mix}i;
        }
    }
    $channel ||= 'Main Mix';
    if (length $title && !_isAudioFilenameTitle($title)
        && $title =~ m{mellow|rock|global|eclectic|main\s*mix|mix}i
        && $title !~ m{^radio\s*paradise$}i) {
        my $t = $title;
        $t =~ s{^\s*radio\s*paradise\s*[:\-–—]?\s*}{}i;
        $channel = $t if length $t;
    }
    return ($channel, 'Radio Paradise', '/material/html/images/radioparadise.svg');
}

sub _niceRadioTitle {
    my ($url, $title) = @_;
    $url   //= '';
    $title //= '';
    $title =~ s/^\s+|\s+$//g if length $title;
    my ($rpTitle) = _radioParadiseChannel($url, $title);
    return $rpTitle if defined $rpTitle;
    if (length $title && !_isAudioFilenameTitle($title) && $title !~ m{^https?://}i) {
        return $title;
    }
    if ($url =~ m{somafm}i) {
        return 'SomaFM';
    }
    if ($url =~ m{^([a-z0-9+.-]+):}i) {
        my $proto = lc($1);
        if ($proto ne 'http' && $proto ne 'https' && $proto ne 'mms' && $proto ne 'rtsp' && $proto ne 'rtmp') {
            $proto =~ s/[-_]/ /g;
            return join(' ', map { ucfirst($_) } split(/\s+/, $proto));
        }
    }
    if ($url =~ m{^https?://([^/:]+)}i) {
        my $host = $1;
        $host =~ s{^www\.}{}i;
        return $host if length $host;
    }
    return length $title ? $title : 'Radio';
}

sub _cliCommandQuery {
    my $request = shift;

    # check this is the correct query.
    #if ($request->isNotCommand([['material-skin-query']])) {
    #    $request->setStatusBadDispatch();
    #    return;
    #}
    my $cmd = $request->getParam('_cmd');
    if ($request->paramUndefinedOrNotOneOf($cmd, ['radios', 'playlists']) ) {
        $request->setStatusBadParams();
        return;
    }

    # List of favourites, but streams only - no artists, albums, folders, etc.
    if ($cmd eq 'radios') {
        my $feed = Slim::Plugin::Favorites::OpmlFavorites->new($request->client)->xmlbrowser(0);
        # TODO: user_id
        _traverseFavoritesTree($request, $feed, 0);
        $request->setStatusDone();
        return;
    }

    # Proxy for standard playlists command that adds mtime of playlist (so know when image _might_ change)
    # and adds list of images, if no user image found
    #
    # NOTE: returning of image(s) disabled for now - as this would mean partsing playlists
    #       everytime list is opened...
    #
    if ($cmd eq 'playlists') {
        my $folder = $request->getParam('folder_id');
        my $userId = $request->getParam('user_id');
        my $search = $request->getParam('search');
        my $tags = $request->getParam('tags');
        my $index  = $request->getParam('_index');
        my $quantity = $request->getParam('_quantity');
        my @plcmd = ("playlists", $index, $quantity, "tags:${tags}");
        if ($folder) {
            push(@plcmd, "folder_id:${folder}")
        }
        if ($search) {
            push(@plcmd, "search:${search}")
        }
        if ($userId) {
            push(@plcmd, "user_id:${userId}");
        }

        my @keys = ("id", "playlist", "textkey", "extid", "url");
        my $plreq = Slim::Control::Request::executeRequest(undef, \@plcmd);
        my $cnt = 0;
        #my $imageDir = Slim::Utils::Prefs::dir() . "/material-skin/playlists";
        #my $imageDirExists = -e $imageDir;

        foreach my $playlist ( @{ $plreq->getResult('playlists_loop') || [] } ) {
            #my $name = undef;
            #my $id = undef;

            foreach my $key (@keys) {
                my $val = $playlist->{$key};
                if (!defined $val) {
                    next;
                }
                $request->addResultLoop("playlists_loop", $cnt, ${key}, ${val});
                if ($key eq "url" && _startsWith("${val}", "file:")) {
                    my $path = Slim::Utils::Misc::pathFromFileURL($val);
                    if (-e $path) {
                        my $mtime = (stat $path)[9];
                        $request->addResultLoop("playlists_loop", $cnt, "mtime", ${mtime});
                    }
                }
                #elsif ($key eq "id" && !_startsWith("${val}", "file:")) {
                #    $id = $val;
                #} elsif ($key eq "playlist") {
                #    $name = $val;
                #}
            }

            #if (defined $id) { # This is a playlist, not folder, so look for cover
            #    my $haveUserImage = 0;
            #    if ($name && $imageDirExists) {
            #        my $fileName = lc($name);
            #        $fileName =~ s/[^a-z_0-9]//ig;
            #        if (-e "${imageDir}/${fileName}.png" || -e "${imageDir}/${fileName}.jpg") {
            #            $haveUserImage = 1;
            #        }
            #    }
            #    if (!$haveUserImage) {
            #        my $treq = Slim::Control::Request::executeRequest(undef, ["playlists", "tracks", 0, PLAYLIST_IMAGE_TRACKS, "tags:cK", "playlist_id:${id}"] );
            #        #my @images = ();
            #        foreach my $track ( @{ $treq->getResult('playlisttracks_loop') || [] } ) {
            #            my $image = undef;
            #            if ($track->{'artwork_url'}) {
            #                $image = $track->{'artwork_url'};
            #                if (_startsWith($image, "http:") || _startsWith($image, "https:")) {
            #                    $image = "/imageproxy/" . URI::Escape::uri_escape_utf8($image) . "/image_300x300_f";
            #                }
            #            } elsif ($track->{'coverid'}) {
            #                $image = "/music/" . $track->{'coverid'} . "/cover_300x300_f";
            #            }
            #            if ($image) {
            #                $request->addResultLoop("playlists_loop", $cnt, "image", $image);
            #                last;
            #                #push(@images, $image);
            #                #if (scalar(@images)>2) {
            #                #    last;
            #                #}
            #            }
            #        }
            #        #if (scalar(@images)>0) {
            #        #    $request->addResultLoop("playlists_loop", $cnt, "images", \@images);
            #        #}
            #    }
            #}
            $cnt+=1;
        }
        $request->addResult("count", $plreq->getResult('count'));
        $request->setStatusDone();
        return;
    }

    $request->setStatusBadParams();
}

sub _traverseFavoritesTree {
    my ($request, $data, $cnt) = @_;
    $cnt //= 0;

    my $quantity = $request->getParam('_quantity');

    foreach my $item (@{$data->{items} || []}) {
        if (ref($item) eq 'HASH') {
            if (_isRadio($item->{url})) {
                $request->addResultLoop("radios_loop", $cnt, "url", $item->{'url'});
                $request->addResultLoop("radios_loop", $cnt, "name", $item->{'name'});
                $request->addResultLoop("radios_loop", $cnt, "icon", $item->{'icon'});

                $cnt++;
            } elsif (ref($item->{items}) eq 'ARRAY' && scalar(@{$item->{items}}) > 0) {
                # Dive into child items
                $cnt = _traverseFavoritesTree->($request, $item, $cnt);
            }
        }

        last if $cnt >= $quantity;
    }

    return $cnt;
}

sub _handleSimilarArtists {
    my $request = shift;
    my $content = shift;
    my $save = shift;
    my $key = shift;
    my $cacheDir = shift;
    my $ignoreAge = shift;
    my $decoded = eval { from_json( $content ) };
    my @artists = ();
    my $cnt = 0;
    my $now = time();
    if ($decoded->{'similarartists'}) {
        if ($decoded->{'time'}) {
            if ($ignoreAge==1 || ($now - $decoded->{'time'})<$MAX_CACHE_AGE) {
                foreach my $artist (@{$decoded->{'similarartists'}}) {
                    push(@artists, $artist);
                    $request->addResultLoop("similar_loop", $cnt, "artist", $artist);
                    $cnt+=1;
                }
                return 1; # Even if empty don't make HTTP call
            }
        } elsif ($decoded->{'similarartists'}->{'artist'}) {
            foreach my $artist (@{$decoded->{'similarartists'}->{'artist'}}) {
                if ($artist->{'name'}) {
                    if ($save ==1) {
                        push(@artists, $artist->{'name'});
                    }
                    $request->addResultLoop("similar_loop", $cnt, "artist", $artist->{'name'});
                    $cnt+=1;
                }
            }
        }
    }

    if ($save==1) {
        my $filePath = $cacheDir . "/" . ${key} . ".json";
        mkdir $cacheDir if ! -d $cacheDir;
        if (open(my $fh, '>', $filePath)) {
            my $data = {'time' => $now, 'similarartists' => \@artists};
            print $fh encode_json($data);
            close($fh);
        }
    }
    return $cnt;
}

sub _cliClientCommand {
    my $request = shift;

    # check this is the correct query.
    if ($request->isNotCommand([['material-skin-client']])) {
        $request->setStatusBadDispatch();
        return;
    }
    my $cmd = $request->getParam('_cmd');
    my $client = $request->client();
    if ($request->paramUndefinedOrNotOneOf($cmd, ['set-lib', 'get-alarm', 'get-dstm', 'save-dstm', 'sort-queue', 'remove-queue', 'command-list', 'rndmix', 'home-extra']) ) {
        $request->setStatusBadParams();
        return;
    }

    if ($cmd eq 'set-lib') {
        my $id = $request->getParam('id');
        if ($request->getParam('store')) {
            my $prev = $serverprefs->client($client)->get('libraryId');
            if ($prev) {
                main::DEBUGLOG && $log->debug("Save prev lib id of ${prev}");
                $prefs->client($client)->set('libraryId', $prev);
            }
        }

        if (!$id && $request->getParam('restore')) {
            $id = $prefs->client($client)->get('libraryId');
            main::DEBUGLOG && $log->debug("Read prev lib id ${id}");
        }

        main::DEBUGLOG && $log->debug("Set lib id ${id}");
        $serverprefs->client($client)->set('libraryId', $id);
        $serverprefs->client($client)->remove('libraryId') unless $id;
        Slim::Utils::Timers::setTimer($client, Time::HiRes::time() + 0.1, sub {Slim::Schema->totals($client);});
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'get-alarm') {
        my $alarmNextAlarm = Slim::Utils::Alarm->getNextAlarm($client);
        if($alarmNextAlarm and $alarmNextAlarm->enabled()) {
            # Get epoch seconds
            my $alarmNext = $alarmNextAlarm->nextDue();
            $request->addResult('alarm', $alarmNext);
        } else {
            $request->addResult('alarm', 0);
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'get-dstm') {
        my $provider = $prefs->client($client)->get('dstm');
        $request->addResult('provider', $provider);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'save-dstm') {
        my $provider = preferences('plugin.dontstopthemusic')->client($client)->get('provider');
        $prefs->client($client)->set('dstm', $provider);
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'sort-queue') {
        my @tracks = Slim::Player::Playlist::songs($client, 0, Slim::Player::Playlist::count($client));
        my $len = scalar(@tracks);
        if ($len>1) {
            Slim::Player::Playlist::stopAndClear($client);
            @tracks = _sortTracks(\@tracks, $request->getParam('order'));
            Slim::Player::Playlist::addTracks($client, \@tracks, 0);
            $client->currentPlaylistModified(1);
            $client->currentPlaylistUpdateTime(Time::HiRes::time());
            Slim::Player::Playlist::refreshPlaylist($client);
        }
        $request->setStatusDone();
        return;
    }

    if ($cmd eq 'remove-queue') {
        my $indexes = $request->getParam('indexes');
        if (defined $indexes) {
            my @list = split(/,/, $indexes);
            foreach my $idx (@list) {
                main::DEBUGLOG && $log->debug("Remove index: $idx");
                Slim::Player::Playlist::removeTrack($client, $idx);
            }
            $client->currentPlaylistModified(1);
            $client->currentPlaylistUpdateTime(Time::HiRes::time());
            Slim::Player::Playlist::refreshPlaylist($client);
        }
        $request->setStatusDone();
        Slim::Control::Request::notifyFromArray($client, ['playlist', 'delete', '_index']);
        return;
    }

    if ($cmd eq 'command-list') {
        my $json = $request->getParam('commands');
        if ($json) {
            my $commands = eval { from_json( $json ) };
            my $actioned = 0;
            $request->setStatusProcessing();
            for my $command (@{$commands}) {
                $client->execute(\@{$command});
                $actioned++;
                main::idleStreams() unless $actioned % 100;
            }
            $request->addResult("actioned", $actioned);
            $request->setStatusDone();
            return;
        }
    }

    if ($cmd eq 'rndmix') {
        my $folder = Slim::Utils::Prefs::dir() . "/material-skin/random-mix";
        my $name = $request->getParam('name');
        my $act = $request->getParam('act');
        if ($name && $act) {
            my $path = File::Spec->catpath('', $folder, $name . RANDOM_MIX_EXT);
            my $details = _readRandMix($path);
            if ($details) {
                my $rprefs = preferences('plugin.randomplay');
                $rprefs->set('continuous', int($details->{'continuous'}));

                my $var = int($details->{'newtracks'});
                if ($var<1 || $var>1000) {
                    $var = 10;
                }
                $rprefs->set('newtracks', $var);
                $var = int($details->{'oldtracks'});
                if ($var<1 || $var>1000) {
                    $var = 10;
                }
                $rprefs->set('oldtracks', $var);
                $client->execute(["randomplaychooselibrary", $details->{'library'}]);

                my @genres = split /,/, $details->{'genres'};
                my $numGenres = scalar(@genres);
                my $allGenres = 0 == $numGenres;
                if ($allGenres==0 && Slim::Schema::hasLibrary()) {
                    my $totals = Slim::Schema->totals($request->client);
                    if ($totals->{genre} == scalar(@genres)) {
                        $allGenres = 1;
                    }
                }
                if ($allGenres == 1) {
                    $client->execute(["randomplaygenreselectall", "1"]);
                } elsif ($allGenres == 0) {
                    $client->execute(["randomplaygenreselectall", "0"]);
                    foreach my $genre (@genres) {
                        $client->execute(["randomplaychoosegenre", $genre, "1"]);
                    }
                }

                $client->execute(["randomplay", $details->{'mix'}]);
                $request->setStatusDone();
                return;
            }
        }
    }

    if ($cmd eq 'home-extra') {
        _handleHomeExtraCmd($request);
        return;
    }

    $request->setStatusBadParams();
}

sub _cliGroupCommand {
    my $request = shift;

    # check this is the correct query.
    if ($request->isNotCommand([['material-skin-group']])) {
        $request->setStatusBadDispatch();
        return;
    }

    my $cmd = $request->getParam('_cmd');
    my $client = $request->client();
    if ($request->paramUndefinedOrNotOneOf($cmd, ['init']) ) {
        $request->setStatusBadParams();
        return;
    }

    if ($cmd eq 'init') {
        # Set group player's enabled browse modes to the enabled modes of all members
        my $groupsPluginPrefs = preferences('plugin.groups');
        my $group = $groupsPluginPrefs->client($client);
        my $volumes = {};
        if ($group) {
            my $members = $group->get('members');
            if ($members) {
                my $groupPrefs = $serverprefs->client($client);
                my $modeList = Slim::Menu::BrowseLibrary->_getNodeList();
                my %modes;
                my $haveMember = 0;
                # Set all modes as disabled
                foreach my $mode (@{$modeList}) {
                    $modes{ $mode->{id} } = 1;
                }

                # iterate over all clients, and set mode to enabled if enabled for client
                foreach my $id (@{$members}) {
                    my $member = Slim::Player::Client::getClient($id);
                    if ($member) {
                        my $clientPrefs = $serverprefs->client($member);
                        if ($clientPrefs) {
                            $haveMember = 1;
                            foreach my $mode (@{$modeList}) {
                                if ($clientPrefs->get("disabled_" . $mode->{id})==0) {
                                    $modes{ $mode->{id} } = 0;
                                }
                            }
                        }
                    }
                    if (!defined $member || $serverprefs->client($member)->get('digitalVolumeControl')) {
                        # if member is not connected, just use the last known volume
                        $volumes->{$id} = (defined $member ? $member->volume : 50) if !defined $volumes->{$id};
                    } else {
                        $volumes->{$id} = -1;
                    }
                }
                $group->set('volumes', $volumes);

                if ($haveMember == 0) {
                    # Group has no members??? Enable some basic modes...
                    foreach my $mode (@DEFAULT_BROWSE_MODES) {
                        $modes{ $mode } = 0;
                    }
                }
                # update group prefs
                my @keys = keys %modes;
                for my $key (@keys) {
                    $groupPrefs->set("disabled_" . $key, $modes{$key});
                }

                $request->setStatusDone();
                return;
            }
        }
    }

    $request->setStatusBadParams()
}

sub _readRandMix {
    my $path = shift;
    if (! -e $path) {
        main::DEBUGLOG && $log->debug("Requested mix file, $path, does not exist");
        return;
    }

    if (open my $fh, "<", $path) {
        main::DEBUGLOG && $log->debug("Reading $path");
        my %info = ();
        while (my $line = <$fh>) {
            if (rindex($line, '#', 0)==-1) {
                $line =~ s/[\r\n]+$//;
                my @parts = split /=/, $line;
                if (scalar(@parts)==2) {
                    if ((@parts[0] eq 'mix') || (@parts[0] eq 'genres') || (@parts[0] eq 'library'))  {
                        $info{@parts[0]}=@parts[1];
                    } elsif ((@parts[0] eq 'oldtracks') || (@parts[0] eq 'newtracks') || (@parts[0] eq 'continuous')) {
                        $info{@parts[0]}=int(@parts[1]);
                    }
                }
            }
        }
        close($fh);
        my $end = substr($info{'mix'}, -1);
        if ($end eq "s") {
            $info{'mix'} = substr($info{'mix'}, 0, length($info{'mix'}) - 1);
        }
        return \%info;
    }
}

sub _saveRandMix {
    my $folder = shift;
    my $name = shift;
    my $mix = shift;
    my $genres = shift;
    my $lib = shift;
    my $continuous = shift;
    my $oldtracks = shift;
    my $newtracks = shift;

    my $path = File::Spec->catpath('', $folder, $name . RANDOM_MIX_EXT);
    if (-e $path) {
        if (! _deleteFile($path)) {
            return 0;
        }
    }

    if (! -e $folder) {
        make_path($folder);
    }
    if (open my $fh, ">", $path) {
        print $fh "mix=$mix\n";
        print $fh "genres=$genres\n";
        print $fh "library=$lib\n";
        print $fh "continuous=$continuous\n";
        print $fh "oldtracks=$oldtracks\n";
        print $fh "newtracks=$newtracks\n";
        close($fh);
    }
    if (-e $path) {
        return 1;
    }
    return 0;
}

sub _deleteFile {
    my $path = shift;
    if (-e $path) {
        unlink($path);
    }
    if (-e $path) {
        return 0;
    }
    return 1;
}

# HTTP client IP of the device operating Material — used to pick a local
# preview player (Mac squeezelite / LyrPlay) instead of the selected room.
sub _clientIpHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient && $httpClient->connected;

    my $ip = $Slim::Web::HTTP::peeraddr{$httpClient} || '';
    $ip =~ s/^::ffff://i;
    $ip =~ s/[^0-9a-fA-F\.:]//g;

    my $body = '{"ip":"' . $ip . '"}';
    $response->code(RC_OK);
    $response->content_type('application/json; charset=utf-8');
    $response->header('Cache-Control' => 'no-store');
    $response->header('Connection' => 'close');
    $response->content_length(length($body));
    $response->content($body);
    $httpClient->send_response($response);
    Slim::Web::HTTP::closeHTTPSocket($httpClient);
}

sub _svgHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $dir = dirname(__FILE__);
    my $svgName = basename($request->uri->path);
    my $filePath = $dir . "/HTML/material/html/images/" . $svgName . ".svg";
    my $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . ".svg";
    my $colour = "#f00";
    my $colour2 = "#";

    if ((! -e $filePath) && (! -e $altFilePath)) {
        $svgName = lc $svgName;
        $filePath = $dir . "/HTML/material/html/images/" . $svgName . ".svg";
        $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . ".svg";
    }
    # If this is for a release type then fallback to release.svg if it does not exist
    if (rindex($svgName, "release-")==0) {
        if ((! -e $filePath) && (! -e $altFilePath)) {
            # Remove -, _, and spaces from release name
            my $type = substr($svgName, 8);
            $type =~ s/[-_,\s]+//g;
            my $newSvgName = "release-" . $type;
            if ($newSvgName ne $svgName) {
                $svgName = $newSvgName;
                $filePath = $dir . "/HTML/material/html/images/" . $svgName . ".svg";
                $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . ".svg";
            }

            if ((! -e $filePath) && (! -e $altFilePath)) {
                # Remove 's' at end...
                my $end = substr($svgName, -1);
                if ($end eq "s") {
                    $svgName = substr($svgName, 0, -1);
                    $filePath = $dir . "/HTML/material/html/images/" . $svgName . ".svg";
                    $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . ".svg";
                }
            }
            if ((! -e $filePath) && (! -e $altFilePath)) {
                if (rindex($svgName, "release-live")==0) {
                    $filePath = $dir . "/HTML/material/html/images/release-live.svg";
                } elsif (rindex($svgName, "release-studio")==0) {
                    $filePath = $dir . "/HTML/material/html/images/release-studio.svg";
                } elsif (rindex($svgName, "release-remix")==0) {
                    $filePath = $dir . "/HTML/material/html/images/release-remix.svg";
                } elsif (rindex($svgName, "composer")>0) {
                    $filePath = $dir . "/HTML/material/html/images/release-composer.svg";
                } elsif (rindex($svgName, "conductor")>0) {
                    $filePath = $dir . "/HTML/material/html/images/release-conductor.svg";
                } elsif ((rindex($svgName, "orchestra")>0) || (rindex($svgName, "appearanceband")>0)) {
                    $filePath = $dir . "/HTML/material/html/images/release-orchestra.svg";
                } elsif (rindex($svgName, "appearance")>0) {
                    $filePath = $dir . "/HTML/material/html/images/release-appearance.svg";
                }
            }
            if ((! -e $filePath) && (! -e $altFilePath)) {
                $filePath = $dir . "/HTML/material/html/images/release.svg";
            }
        }
    }
    # If this is for a role type then fallback to artist.svg if it does not exist
    elsif (rindex($svgName, "role-")==0) {
        if ((! -e $filePath) && (! -e $altFilePath)) {
            $svgName = substr($svgName, 5); # Remove 'role-'
            $svgName =~ s/[-_,\s]+//g; # Remove some chars
            my $roleName = "";
            my $useRoleName = 0;
            if (looks_like_number($svgName)) { # Numerical value, map to name
                my $val = int(0 + $svgName);
                if (1==$val || 6==$val) {
                    $svgName = "artist";
                } elsif (2==$val) {
                    $svgName = "role-composer";
                } elsif (3==$val) {
                    $svgName = "role-conductor";
                } elsif (4==$val) {
                    $svgName = "role-band";
                } elsif (5==$val) {
                    $svgName = "role-albumartist";
                } elsif ($val>=21) {
                    my $roles = $serverprefs->get('userDefinedRoles');
                    foreach my $role (keys %{$roles}) {
                        if ($roles->{$role}->{id}==$val) {
                            $roleName = lc($role);
                            $roleName =~ s/[-_,\s]+//g;
                            $svgName = "role-" . $roleName;
                            $useRoleName = 1;
                            last;
                        }
                    }
                }
                $filePath = $dir . "/HTML/material/html/images/" . $svgName . ".svg";
                $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . ".svg";
            }
            my $lookFor = $useRoleName==1 ? $roleName : $svgName;
            if ((! -e $filePath) && (! -e $altFilePath)) {
                foreach my $k (keys %ROLE_ICON_MAP) {
                    if (rindex($lookFor, $k)>=0) {
                        $filePath = $dir . "/HTML/material/html/images/role-" . $ROLE_ICON_MAP{$k} . ".svg";
                        $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/role-" . $ROLE_ICON_MAP{$k} . ".svg";
                        last;
                    }
                }
            }
            if ((! -e $filePath) && (! -e $altFilePath)) {
                foreach my $role (@listOfRoles) {
                    if (rindex($lookFor, $role)>=0) {
                        $filePath = $dir . "/HTML/material/html/images/role-" . $role . ".svg";
                        $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/role-" . $role . ".svg";
                        last;
                    }
                }
            }
            if ((! -e $filePath) && (! -e $altFilePath)) {
                $filePath = $dir . "/HTML/material/html/images/artist.svg";
            }
        }
    }

    elsif (rindex($svgName, "random-")==0) {
        if ((! -e $filePath) && (! -e $altFilePath)) {
            my $end = substr($svgName, -1);
            if ($end ne "s") {
                $filePath = $dir . "/HTML/material/html/images/" . $svgName . "s.svg";
                $altFilePath = Slim::Utils::Prefs::dir() . "/material-skin/images/" . $svgName . "s.svg";
            }
            if ((! -e $filePath) && (! -e $altFilePath)) {
                $filePath = $dir . "/HTML/material/html/images/dice-multiple.svg";
            }
        }
    }
    # If desired path does not exist check alt location
    if (! -e $filePath) {
        $filePath = $altFilePath;
    }

    if ($request->uri->can('query_param')) {
        $colour = "#" . $request->uri->query_param('c');
        $colour2 = "#" . $request->uri->query_param('c2');
    } else { # Manually extract "c=colour" query parameter...
        my $uri = $request->uri->as_string;
        $colour = "#" . _getUrlQueryParam($uri, "c");
        my $c2 = _getUrlQueryParam($uri, "c2");
        if ($c2) {
            $colour2 = "#" . $c2;
        }
    }

    # Check for plugin icon...
    if (! -e $filePath) {
        my $skin = $serverprefs->get('skin');
        my $path = substr $request->uri->path, 14; # remove /material/svg/
        # Plugin images from 'Extra's might have '/material/html/images/' prefix
        # if so we need to remove this
        $path=~ s/material\/html\/images\///g;
        main::DEBUGLOG && $log->debug("Looking for: " . $path);
        $filePath = $skinMgr->fixHttpPath($skin, $path);
    }

    if (-e $filePath) {
        my $svg = read_file($filePath);
        $svg =~ s/#000/$colour/g;
        if (length($colour2)>3) {
            $svg =~ s/#fff/$colour2/g;
        } else {
            $svg =~ s/fill\s*=\s*"[#0-9a-fA-F\.]+"/fill="${colour}"/g;
            $svg =~ s/stroke\s*=\s*"[#0-9a-fA-F\.]+"/stroke="${colour}"/g;
        }
        if (index($svg, "fill=\"")==-1) {
            $svg =~ s/\<path /\<path fill="${colour}" /g;
        }
        $response->code(RC_OK);
        $response->content_type('image/svg+xml');
        $response->header('Cache-Control' => 'max-age=' . $CACHE_MAX_AGE);
        $response->header('Connection' => 'close');
        $response->content($svg);
    } else {
        $response->code(RC_NOT_FOUND);
    }
    $httpClient->send_response($response);
    Slim::Web::HTTP::closeHTTPSocket($httpClient);
}

sub _checkUpdateStatus {
    my ($request) = @_;
    main::DEBUGLOG && $log->debug("Got updates response");

    my $params = {};
    my $serverUpdate = $::newVersion;
    my $pluginsUpdate = 0;
    my $needRestart = Slim::Utils::PluginManager->needsRestart;

    if (my $newPlugins = Slim::Utils::PluginManager->message) {
        $pluginsUpdate = 1;
    }

    if ($params->{installerFile}) {
        $serverUpdate = 1;
    } elsif (!defined $serverUpdate) {
        $serverUpdate = 0;
    }

    main::DEBUGLOG && $log->debug("Updates - server:${serverUpdate} plugins:${pluginsUpdate} needRestart:${needRestart}");
    Slim::Control::Request::notifyFromArray(undef, ['material-skin', 'notification', 'updateinfo', $serverUpdate, $pluginsUpdate, $needRestart]);
}

sub _checkUpdates {
    main::DEBUGLOG && $log->debug("Check for updates");
    Slim::Utils::Timers::killTimers(undef, \&_checkUpdates);

    my ($current) = getCurrentPlugins();
    my $request = Slim::Control::Request->new(undef, ['appsquery']);

    $request->addParam(args => {
        type    => 'plugin',
        details => 1,
        current => $current,
    });

    $request->callbackParameters(\&_checkUpdateStatus, [ $request ]);
    $request->execute();
    if (Slim::Utils::Versions->compareVersions($::VERSION, '8.4.0') < 0) {
        # Schedule next check (use LMS's setting, or every 2hrs if not set)...
        my $delay = $serverprefs->get('checkVersionInterval') || (24*60*60);
        main::DEBUGLOG && $log->debug("Next automatic update check in ${delay} seconds");
        Slim::Utils::Timers::setTimer(undef, Time::HiRes::time() + $delay, \&_checkUpdates);
    }
}

sub _customCssHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $fileName = basename($request->uri->path);
    my $filePath = '';

    if ('msk--' eq substr($fileName, 0, 5)) {
        my $dir = dirname(__FILE__);
        $fileName = substr($fileName, 5);
        $filePath = $dir . "/HTML/material/html/css/other/" . $fileName . ".min.css";
        if (! -e $filePath) {
            $filePath = $dir . "/HTML/material/html/css/other/" . $fileName . ".css";
        }
    } else {
        $filePath = Slim::Utils::Prefs::dir() . "/material-skin/css/" . $fileName . ".css";
        if (! -e $filePath) { # Try pre 1.6.0 path
            $filePath = Slim::Utils::Prefs::dir() . "/plugin/material-skin." . $fileName . ".css";
        }
    }

    $response->code(RC_OK);
    if (-e $filePath) {
        Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'text/css', $filePath, '', 'noAttachment' );
    } else {
        $response->content_type('text/css');
        $response->header('Connection' => 'close');
        $response->content("");
        $httpClient->send_response($response);
        Slim::Web::HTTP::closeHTTPSocket($httpClient);
    }
}

sub _customJsHandler{
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $fileName = basename($request->uri->path);
    my $filePath = '';

    if ('custom.js' eq $fileName) {
        $filePath = Slim::Utils::Prefs::dir() . "/material-skin/custom.js";
    } elsif ('msk--' eq substr($fileName, 0, 5)) {
        my $dir = dirname(__FILE__);
        $fileName = substr($fileName, 5);
        $filePath = $dir . "/HTML/material/html/js/other/" . $fileName . ".min.js";
        if (! -e $filePath) {
            $filePath = $dir . "/HTML/material/html/js/other/" . $fileName . ".js";
        }
    } else {
        $filePath = Slim::Utils::Prefs::dir() . "/material-skin/js/" . $fileName . ".js";
    }

    $response->code(RC_OK);
    if (-e $filePath) {
        Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'application/javascript', $filePath, '', 'noAttachment' );
    } else {
        $response->content_type('application/javascript');
        $response->header('Connection' => 'close');
        $response->content("");
        $httpClient->send_response($response);
        Slim::Web::HTTP::closeHTTPSocket($httpClient);
    }
}

sub _customActionsHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $filePath = Slim::Utils::Prefs::dir() . "/material-skin/actions.json";
    if (! -e $filePath) { # Try pre 1.6.0 path
        $filePath = Slim::Utils::Prefs::dir() . "/plugin/material-skin.actions.json";
    }
    $response->code(RC_OK);
    if (-e $filePath) {
        Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'application/json', $filePath, '', 'noAttachment' );
    } else {
        $response->code(RC_OK);
        $response->content_type('application/json');
        $response->header('Connection' => 'close');
        $response->content("{}");
        $httpClient->send_response($response);
        Slim::Web::HTTP::closeHTTPSocket($httpClient);
    }
}

sub _manifestHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $ua = $request->header('user-agent');
    my $filePath = dirname(__FILE__) . "/HTML/material/html/material.webmanifest";
    my $manifest = read_file($filePath);
    my $query = $request->uri()->query();
    my $iOS = index($ua, 'iPad') != -1 || index($ua, 'iPhone') != -1 || index($ua, 'SafariViewService') != -1 || index($ua, 'MobileSafari') != -1 || (index($ua, 'Macintosh') != -1 && index($ua, '(KHTML, like Gecko) Version') != -1);

    if (defined $request->{_headers}->{'referer'}) {
        # See if we have any query params, if so add to start_url...
        my $referer = $request->{_headers}->{'referer'};
        my $queryPos = index($referer, '?');
        if ($queryPos !=-1) {
            my $query = substr($referer, $queryPos);
            $manifest =~ s/\"start_url\": \"\/material\"/\"start_url\": \"\/material\/$query\"/g;
        }
    }

    my $themeColor = "000000";
    # Make manifest colours match platform default theme...
    #if (index($ua, 'Android') != -1) {
    #    $themeColor="000000";
    #} elsif (index($ua, 'iPad') != -1 || index($ua, 'iPhone') != -1 || index($ua, 'MobileSafari') != -1) { # || (index($ua, 'Macintosh') != -1 && index($ua, '(KHTML, like Gecko) Version') != -1)) {
    #    $themeColor="ffffff";
    #} els
    if (index($ua, 'Linux') != -1) {
        $themeColor="2d2d2d";
    #} elsif (index($ua, 'Win') != -1) {
    #    $themeColor="000000";
    } elsif (index($ua, 'Mac') != -1) {
        $themeColor="353537";
    }

    # Finally check to see if a themeColor was specified in URL
    my $start = index($query, 'themeColor=');
    if ($start!=-1) {
        $start += 11;
        my $end = index($query, "&", $start);
        if ($end!=-1) {
            $themeColor = substr($query, $start, $end-$start);
        } else {
            $themeColor = substr($query, $start);
        }
    }
    $manifest =~ s/\"#212121\"/\"#${themeColor}\"/g;

    my $title = $prefs->get('windowTitle');
    if ($title && $title ne '') {
        $manifest =~ s/\"name\": \".+\"/\"text\": \"${title}\"/g;
    }
    my $shortTitle = $prefs->get('shortTitle');
    if ($shortTitle && $shortTitle ne '') {
        $manifest =~ s/\"short_name\": \".+\"/\"text\": \"${shortTitle}\"/g;
    }

    $response->code(RC_OK);
    $response->content_type('application/manifest+json');
    $response->header('Cache-Control' => 'max-age=' . $CACHE_MAX_AGE);
    $response->header('Connection' => 'close');
    $response->content($manifest);
    $httpClient->send_response($response);
    Slim::Web::HTTP::closeHTTPSocket($httpClient);
}

sub _userThemeHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $dark = 1;
    my $pos = index($request->uri->path, "/dark/");
    if ($pos<0) {
        $pos = index($request->uri->path, "/light/");
        my $dark = 0;
    }
    my $theme = substr($request->uri->path, $pos);
    my $filePath = Slim::Utils::Prefs::dir() . "/material-skin/themes" . $theme . ".css";
    $response->code(RC_OK);
    if (! -e $filePath) {
        # Not found, fallback to a default one...
        $filePath = dirname(__FILE__) . "/HTML/material/html/css/themes/" . ($dark == 1 ? "dark" : "light") . ".css";
        if (! -e $filePath) {
            $filePath = dirname(__FILE__) . "/HTML/material/html/css/themes/" . ($dark == 1 ? "dark" : "light") . ".min.css";
        }
    }
    $response->code(RC_OK);
    Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'text/css', $filePath, '', 'noAttachment' );
}

sub _userColorHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $filePath = Slim::Utils::Prefs::dir() . "/material-skin/colors/" . basename($request->uri->path) . ".css";
    $response->code(RC_OK);
    if (! -e $filePath) {
        # Not found, fallback to a default one...
        $filePath = dirname(__FILE__) . "/HTML/material/html/css/colors/blue.css";
        if (! -e $filePath) {
            $filePath = dirname(__FILE__) . "/HTML/material/html/css/colors/blue.min.css";
        }
    }
    $response->code(RC_OK);
    Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'text/css', $filePath, '', 'noAttachment' );
}

sub _downloadHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $id = undef;

    if ($request->uri->can('query_param')) {
        $id = $request->uri->query_param('id');
    } else { # Manually extract "id=trackid" query parameter...
        my $uri = $request->uri->as_string;
        my $start = index($uri, "id=");

        if ($start > 0) {
            $start += 3;
            $id = "#" . substr($uri, $start+3);
        }
    }

    my $obj = Slim::Schema->find('Track', $id);

    if (blessed($obj) && Slim::Music::Info::isSong($obj) && Slim::Music::Info::isFile($obj->url)) {
        $response->code(RC_OK);
        $response->headers->remove_content_headers;
        Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, 'application/octet-stream', Slim::Utils::Misc::pathFromFileURL($obj->url), $obj, 1 );
    } else {
        $response->code(RC_NOT_FOUND);
        $httpClient->send_response($response);
        Slim::Web::HTTP::closeHTTPSocket($httpClient);
    }
}

sub _backdropHandler {
    my ( $httpClient, $response ) = @_;
    return unless $httpClient->connected;

    my $request = $response->request;
    my $fileName = basename($request->uri->path);
    my $filePath = Slim::Utils::Prefs::dir() . "/material-skin/backdrops/" . $fileName;
    my $user = 0;
    if (! -e $filePath) {
        $filePath = dirname(__FILE__) . "/HTML/material/html/backdrops/" . $fileName;
        $user = 1;
    }
    $response->code(RC_OK);
    if ($user == 0) {
        $response->header('Cache-Control' => 'max-age=' . $CACHE_MAX_AGE);
    }
    Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, "image/jpeg", $filePath, '', 'noAttachment' );
}

sub _sendImage {
    my ( $httpClient, $response, $path, $ext, $mime ) = @_;
    my $filePath = $path . "." . $ext;
    if (-e $filePath) {
        Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, $mime, $filePath, '', 'noAttachment' );
        return 1;
    }
    return 0;
}

sub _sendFallbackImage {
    my ( $httpClient, $response, $subdir, $fileName, $notfound ) = @_;
    return unless $httpClient->connected;
    if ( $fileName) {
        my $imageDir = Slim::Utils::Prefs::dir() . "/material-skin/" . $subdir;
        if (! -e $imageDir) {
            make_path($imageDir);
        }
        my $filePath = $imageDir . "/" . $fileName;
        my $placeholder = $filePath . ".missing";
        File::Slurp::write_file($placeholder, { err_mode => 'carp' }, '' ) unless -f $placeholder;
    }
    my $fileNotFoundPath = dirname(__FILE__) . "/HTML/material/html/images/" . $notfound . ".png";
    Slim::Web::HTTP::sendStreamingFile( $httpClient, $response, "image/png", $fileNotFoundPath, '', 'noAttachment' );
}

sub _sendMaterialImage {
    my ( $httpClient, $response, $subdir, $fileName ) = @_;
    if ($httpClient->connected) {
        my $imageDir = Slim::Utils::Prefs::dir() . "/material-skin/" . $subdir;
        my $filePath = $imageDir . "/" . $fileName;
        $response->code(RC_OK);
        if (_sendImage($httpClient, $response, $filePath, "jpg", "image/jpeg")==0) {
            if (_sendImage($httpClient, $response, $filePath, "png", "image/png")==0) {
                return 0
            }
        }
    }
    return 1
}

sub _genreHandler {
    my ( $httpClient, $response ) = @_;
    my $fileName = basename($response->request->uri->path);
    if (0==_sendMaterialImage($httpClient, $response, "genres", $fileName)) {
        _sendFallbackImage($httpClient, $response, "genres", $fileName, "nogenre");
    }
}

sub _playlistHandler {
    my ( $httpClient, $response ) = @_;
    my $playlistName = uri_unescape(basename($response->request->uri->path));
    if ($playlistName && $playlistName =~/$&full=1$/) {
        $playlistName = substr($playlistName, 0, -7);
    }

    if ($playlistName) {
        utf8::decode($playlistName);
    }
    my $fileName = lc($playlistName);
    $fileName =~ s/[^a-z_0-9]//ig;

    if (0==_sendMaterialImage($httpClient, $response, "playlists", $fileName)) {
        my $size = "/image_300x300_f";
        my $req = $response->request;

        if ($req->uri->can('query_param')) {
            if ("1" eq $req->uri->query_param('full')) {
                $size = "/cover";
            }
        } else { # Manually extract "full=1" query parameter...
            if (index($req->uri->as_string, "full=1") > 0) {
                $size = "/cover";
            }
        }

        foreach my $playlist ( Slim::Schema->rs('Playlist')->getPlaylists('all')->all ) {
            if ($playlist->title eq $playlistName) {
                my $request = Slim::Control::Request::executeRequest(undef, ["playlists", "tracks", 0, PLAYLIST_IMAGE_TRACKS, "tags:cK", "playlist_id:" . $playlist->id] );
                foreach my $playlist ( @{ $request->getResult('playlisttracks_loop') || [] } ) {
                    my $image = undef;
                    if ($playlist->{'artwork_url'}) {
                        $image = $playlist->{'artwork_url'};
                        if (_startsWith($image, "http:") || _startsWith($image, "https:")) {
                            $image = "/imageproxy/" . URI::Escape::uri_escape_utf8($image) . $size;
                        }
                    } elsif ($playlist->{'coverid'}) {
                        $image = "/music/" . $playlist->{'coverid'} . $size;
                    }
                    if ($image) {
                        $response->code(301);
                        $response->header('Location' => $image );
                        $httpClient->send_response($response);
                        Slim::Web::HTTP::closeHTTPSocket($httpClient);
                        return;
                    }
                }
            }
        }
        _sendFallbackImage($httpClient, $response, "playlists", undef, "noplaylist");
    }
}

# ── Presets picker artwork + title helpers ──────────────────────────────────
# Favorites->all() strips icons; rebuild url→icon from OPML + favorites CLI + Spotty cache.
# Prefer real Spotify CDN / imageproxy covers over generic Spotty plugin icons.

sub _materialCleanPresetTitle {
    my ($title, $url) = @_;
    $title = '' unless defined $title;
    my $source = '';
    # "Spotify : Title" / "spotify: Title" / "Spotify:Title"
    if ($title =~ s/^\s*spotify\s*:\s*//i) {
        $source = 'spotify';
    }
    elsif ($url && $url =~ /^spotify:/i) {
        $source = 'spotify';
    }
    elsif ($url && $url =~ /^qobuz:/i) {
        $source = 'qobuz';
    }
    $title =~ s/^\s+|\s+$//g;
    return ($title, $source);
}

# Parse LMS/Spotify French-style titles and Spotty cache into structured meta.
# Returns: { title, artist, album, type, source, icon }
# $light=1: skip Schema objectForUrl (used for bulk options_loop — can be hundreds of rows)
sub _materialEnrichItemMeta {
    my ($rawTitle, $url, $it, $light) = @_;
    $rawTitle = '' unless defined $rawTitle;
    $url = '' unless defined $url;
    $it ||= {};
    $light = 0 unless defined $light;

    my ($title, $source) = _materialCleanPresetTitle($rawTitle, $url);
    my $type   = $it->{type} // '';
    my $artist = $it->{artist} // $it->{artist_name} // '';
    my $album  = $it->{album} // $it->{album_name} // '';
    my $icon   = '';

    # URI kind from Spotify (and similar) schemes
    if ($url =~ m{^spotify:(album|artist|track|playlist|episode|show):}i) {
        $type ||= lc($1);
        $source ||= 'spotify';
    }
    elsif ($url =~ m{^spotify://(album|artist|track|playlist)/}i) {
        $type ||= lc($1);
        $source ||= 'spotify';
    }
    elsif ($url =~ m{^db:album\.}) {
        $type ||= 'album';
    }
    elsif ($url =~ m{^db:contributor\.|^db:artist\.}) {
        $type ||= 'artist';
    }

    # Spotty metadata cache (best for album/artist/track) — in-memory, OK for bulk
    if ($url =~ /^spotify:/i) {
        my $cached;
        eval {
            require Plugins::Spotty::API::Cache;
            my $c = Plugins::Spotty::API::Cache->new();
            $cached = $c->get($url);
            if (!$cached) {
                my $alt = $url;
                $alt =~ s{^spotify://}{spotify:};
                $cached = $c->get($alt);
            }
        };
        if ($cached && ref $cached eq 'HASH') {
            $icon = $cached->{image} || ($cached->{album} && $cached->{album}->{image}) || $icon;
            if ($cached->{name} && length $cached->{name}) {
                # Prefer structured name over long concatenated LMS title
                if ($type eq 'album' || $type eq 'artist' || $type eq 'track' || $type eq 'playlist'
                    || !$title || $title =~ /\bpar\b|\bby\b|\bde\b/i) {
                    $title = $cached->{name} if $cached->{name};
                }
            }
            if (!$artist) {
                if ($cached->{artist}) {
                    $artist = $cached->{artist};
                }
                elsif ($cached->{artists} && ref $cached->{artists} eq 'ARRAY' && @{$cached->{artists}}) {
                    $artist = join(', ', map { $_->{name} || () } @{$cached->{artists}});
                }
            }
            if (!$album && $cached->{album}) {
                if (ref $cached->{album} eq 'HASH') {
                    $album = $cached->{album}->{name} || '';
                    $icon ||= $cached->{album}->{image} || '';
                    if (!$artist && $cached->{album}->{artists} && ref $cached->{album}->{artists} eq 'ARRAY') {
                        $artist = join(', ', map { $_->{name} || () } @{$cached->{album}->{artists}});
                    }
                }
                else {
                    $album = $cached->{album};
                }
            }
            $type ||= $cached->{type} if $cached->{type};
        }
    }

    # Local library objects — expensive; skip for bulk options
    if (!$light && (!$artist || !$album || !$icon) && $url) {
        eval {
            my $obj = Slim::Schema->objectForUrl({ url => $url, create => 0, readTags => 0 });
            if ($obj) {
                if ($obj->can('artistName') && !$artist) {
                    $artist = $obj->artistName || '';
                }
                if ($obj->can('albumname') && !$album) {
                    $album = $obj->albumname || '';
                }
                elsif ($obj->can('album') && $obj->album && !$album) {
                    my $al = $obj->album;
                    $album = blessed($al) && $al->can('title') ? ($al->title || '') : '';
                }
                if ($obj->can('title') && $obj->title && ($type eq 'track' || $type eq 'album')) {
                    $title = $obj->title if $title =~ /\bpar\b|\bby\b/i || !length $title;
                }
                if ($obj->can('coverid') && $obj->coverid && !$icon) {
                    $icon = '/music/' . $obj->coverid . '/cover';
                }
            }
        };
    }

    # Parse French/English concatenated titles when meta still missing
    # "Title par Artist de Album" / "Title by Artist from Album" / "Title par Artist"
    if ((!$artist || !$album) && $title) {
        my ($t2, $ar, $al) = _materialParseTitleArtistAlbum($title);
        $title  = $t2 if $t2;
        $artist = $ar if $ar && !$artist;
        $album  = $al if $al && !$album;
    }

    $title =~ s/^\s+|\s+$//g if $title;
    $artist =~ s/^\s+|\s+$//g if $artist;
    $album =~ s/^\s+|\s+$//g if $album;

    return {
        title  => $title,
        artist => $artist || '',
        album  => $album || '',
        type   => $type || '',
        source => $source || '',
        icon   => $icon || '',
    };
}

# "Track par Artist de Album" | "Track by Artist from Album" | "Album par Artist"
sub _materialParseTitleArtistAlbum {
    my ($title) = @_;
    return ($title, '', '') unless defined $title && length $title;

    # par X de Y  (FR favorites style)
    if ($title =~ /^(.*?)\s+par\s+(.+?)\s+de\s+(.+)$/i) {
        return ($1, $2, $3);
    }
    # by X from Y
    if ($title =~ /^(.*?)\s+by\s+(.+?)\s+from\s+(.+)$/i) {
        return ($1, $2, $3);
    }
    # par X only
    if ($title =~ /^(.*?)\s+par\s+(.+)$/i) {
        return ($1, $2, '');
    }
    # by X only
    if ($title =~ /^(.*?)\s+by\s+(.+)$/i) {
        return ($1, $2, '');
    }
    return ($title, '', '');
}

sub _materialIconQuality {
    my ($icon) = @_;
    return 0 unless defined $icon && length $icon;
    return 100 if $icon =~ m{imageproxy|/i\.scdn\.co|scdn\.co}i;
    return 90  if $icon =~ m{^https?://}i;
    return 70  if $icon =~ m{/music/.+/cover};
    return 15  if $icon =~ m{Spotty|spotty}i;           # often wrong / stale hash
    return 5   if $icon =~ m{favorites\.png|cover\.png|html/images}i;
    return 40;
}

sub _materialPickBestIcon {
    my $best = '';
    my $bestQ = 0;
    for my $raw (@_) {
        next unless defined $raw && length $raw;
        my $n = _materialNormalizeIconPath($raw);
        next unless $n;
        my $q = _materialIconQuality($n);
        if ($q > $bestQ) {
            $bestQ = $q;
            $best = $n;
        }
    }
    return $best;
}

sub _materialNormalizeIconPath {
    my ($icon) = @_;
    return '' unless defined $icon && length $icon;
    if ($icon =~ m{^https?://}i) {
        require URI::Escape;
        return '/imageproxy/' . URI::Escape::uri_escape($icon) . '/image.png';
    }
    if ($icon =~ m{^/(?:imageproxy|plugins|music|html)/}) {
        return $icon;
    }
    if ($icon =~ m{^(?:html|plugins|music)/}) {
        return '/' . $icon;
    }
    if ($icon =~ m{^[0-9a-fA-F]{8,}$}) {
        return '/music/' . $icon . '/cover';
    }
    return $icon;
}

sub _materialSpottyCover {
    my ($url) = @_;
    return '' unless $url && $url =~ /^spotify:/i;
    my $img = '';
    # Spotty metadata cache (uri → { image => 'https://i.scdn.co/...' })
    eval {
        require Plugins::Spotty::API::Cache;
        my $c = Plugins::Spotty::API::Cache->new();
        my $cached = $c->get($url);
        if (!$cached && $url =~ s{^spotify://}{spotify:}) {
            $cached = $c->get($url);
        }
        if ($cached && ref $cached eq 'HASH') {
            $img = $cached->{image} || ($cached->{album} && $cached->{album}->{image}) || '';
        }
    };
    if (!$img) {
        eval {
            my $cache = Slim::Utils::Cache->new();
            my $cached = $cache->get($url);
            if ($cached && ref $cached eq 'HASH') {
                $img = $cached->{image} || ($cached->{album} && $cached->{album}->{image}) || '';
            }
        };
    }
    return $img ? _materialNormalizeIconPath($img) : '';
}

sub _materialResolveUrlIcon {
    my ($url) = @_;
    return '' unless defined $url && length $url;

    # Prefer Spotty CDN cover before generic protocol icon
    my $spotty = _materialSpottyCover($url);
    return $spotty if $spotty && _materialIconQuality($spotty) >= 90;

    my $icon = '';
    eval {
        $icon = Slim::Player::ProtocolHandlers->iconForURL($url) || '';
    };
    $icon = _materialNormalizeIconPath($icon);
    # Drop weak generic icons if we have nothing better
    if ($icon && _materialIconQuality($icon) < 20) {
        $icon = '';
    }

    eval {
        my $obj = Slim::Schema->objectForUrl({ url => $url, create => 0, readTags => 0 });
        if ($obj && $obj->can('coverid') && $obj->coverid) {
            return '/music/' . $obj->coverid . '/cover';
        }
        if ($obj && $obj->can('artwork_url') && $obj->artwork_url) {
            return _materialNormalizeIconPath($obj->artwork_url);
        }
    };

    return $icon;
}

sub _materialSetIconMap {
    my ($map, $url, $icon) = @_;
    return unless $url && $icon;
    my $n = _materialNormalizeIconPath($icon);
    return unless $n;
    my $prev = $map->{$url};
    if (!$prev || _materialIconQuality($n) > _materialIconQuality($prev)) {
        $map->{$url} = $n;
    }
}

sub _materialWalkFavIcons {
    my ($level, $map) = @_;
    return unless $level && ref $level eq 'ARRAY';
    for my $entry (@$level) {
        next unless $entry && ref $entry eq 'HASH';
        my $url = $entry->{URL} // $entry->{url} // '';
        my $icon = $entry->{icon} // $entry->{image} // $entry->{cover} // '';
        if (length $url) {
            if (!$icon || ($url =~ /^(?:db:album|file:)/ && $icon !~ /^https?:/i && $icon !~ /imageproxy|scdn/i)) {
                eval {
                    require Slim::Plugin::Favorites::OpmlFavorites;
                    my $i2 = Slim::Plugin::Favorites::OpmlFavorites->icon($url) || '';
                    $icon = $i2 if $i2 && _materialIconQuality($i2) >= _materialIconQuality($icon);
                };
            }
            my $spotty = _materialSpottyCover($url);
            _materialSetIconMap($map, $url, $spotty) if $spotty;
            _materialSetIconMap($map, $url, $icon) if $icon;
        }
        if ($entry->{outline} && ref $entry->{outline} eq 'ARRAY') {
            _materialWalkFavIcons($entry->{outline}, $map);
        }
    }
}

sub _materialPresetIconMap {
    my ($client) = @_;
    my %map;

    eval {
        require Slim::Utils::Favorites;
        my $favs = Slim::Utils::Favorites->new($client);
        eval { $favs->_urlindex if $favs->can('_urlindex'); };
        my $top;
        if ($favs->can('toplevel')) {
            $top = $favs->toplevel;
        }
        elsif (ref $favs eq 'HASH' || blessed($favs)) {
            $top = eval { $favs->toplevel } || eval { $favs->{'toplevel'} };
        }
        _materialWalkFavIcons($top, \%map) if $top;
    };

    # favorites items CLI — best source for Spotify CDN covers
    eval {
        my $req = Slim::Control::Request::executeRequest(
            $client,
            ['favorites', 'items', 0, 500, 'want_url:1']
        );
        return unless $req && $req->can('getResultLoopCount');
        my $n = $req->getResultLoopCount('loop_loop') || 0;
        for (my $i = 0; $i < $n; $i++) {
            my $url = $req->getResultLoop('loop_loop', $i, 'url') // '';
            my $img = $req->getResultLoop('loop_loop', $i, 'image')
                   // $req->getResultLoop('loop_loop', $i, 'icon')
                   // $req->getResultLoop('loop_loop', $i, 'artwork_url')
                   // '';
            next unless length $url && length $img;
            _materialSetIconMap(\%map, $url, $img);
        }
    };

    return \%map;
}

1;

# Small stub for Plugins::MaterialSkin::Search to use LMS methods if available
package Plugins::MaterialSkin::Search;

use Slim::Web::Pages::Search;

sub advancedSearch {
    my ($client, $params) = @_;

    $params->{'searchType'} ||= 'Album';

    my @versionParts = split /\./, $::VERSION;
    if ($versionParts[0]>=9) {
        $params->{'searchType'} = 'AlbumWork';
    }
    return Slim::Web::Pages::Search::parseAdvancedSearchParams($client, $params);
}

sub options {
    return Slim::Web::Pages::Search::parseAdvancedSearchParams($_[0], {});
}

1;
