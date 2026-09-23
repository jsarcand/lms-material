package Plugins::MaterialSkin::SessionLog;

#
# LMS-Material — local session history for Context Stats
#
# Opt-in only (plugin.material-skin sessionEnhance). Local server DB, no phone-home.
# Endpoint (player) playback is the source of truth; controller supplies context hints.
#
# Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
# MIT license.
#

use strict;
use DBI;
use Digest::MD5 qw(md5_hex);
use File::Path qw(make_path);
use File::Spec::Functions qw(catdir catfile);
use JSON::XS::VersionOneAndTwo;
use Slim::Utils::Log;
use Slim::Utils::Prefs;
use Slim::Utils::Timers;
use Time::HiRes;

my $log = logger('plugin.material-skin');
my $prefs = preferences('plugin.material-skin');

use constant SESSION_RETENTION_DAYS => 90;
use constant MIN_TRACK_SECONDS => 5;
use constant CONTEXT_STICKY_SECS => 6 * 3600;

my $dbh;
my $useFileFallback = 0;
my $filePath;
my $dbPath;
my %openPlay; # player_id => { row_id, started, url }

sub init {
    $prefs->init({
        sessionEnhance => 0,
    });
    # Never leave the pref as undef (looks "off" after reload). Close open plays when disabled.
    $prefs->setChange(sub {
        my ($pref, $val) = @_;
        if (!defined $val) {
            # Coerce first; recursive setChange sees 0 and continues below
            $prefs->set($pref, 0);
            return;
        }
        if (!$val) {
            foreach my $pid (keys %openPlay) {
                _closeOpenPlay($pid, time());
            }
            %openPlay = ();
        }
        main::INFOLOG && $log->info('SessionLog: sessionEnhance => ' . ($val ? 1 : 0));
    }, 'sessionEnhance');

    # Normalize any legacy undef left in the prefs file
    if (!defined $prefs->get('sessionEnhance')) {
        $prefs->set('sessionEnhance', 0);
    }

    _openStore();
    Slim::Control::Request::subscribe(\&_onPlaylistNewsong, [['playlist'], ['newsong']]);
    Slim::Control::Request::subscribe(\&_onPlaylistStopish, [['playlist'], ['stop', 'pause', 'clear']]);
    # Periodic prune
    Slim::Utils::Timers::setTimer(undef, Time::HiRes::time() + 120, \&_pruneTimer);
    main::INFOLOG && $log->info('SessionLog: init enhance=' . (isEnhanceEnabled() ? 1 : 0) .
        ' store=' . ($useFileFallback ? 'file' : ($dbh ? 'sqlite' : 'none')));
}

sub shutdown {
    Slim::Control::Request::unsubscribe(\&_onPlaylistNewsong);
    Slim::Control::Request::unsubscribe(\&_onPlaylistStopish);
    Slim::Utils::Timers::killTimers(undef, \&_pruneTimer);
    foreach my $pid (keys %openPlay) {
        _closeOpenPlay($pid, time());
    }
    if ($dbh) {
        eval { $dbh->disconnect; };
        $dbh = undef;
    }
}

sub isEnhanceEnabled {
    my $v = $prefs->get('sessionEnhance');
    return (defined $v && $v) ? 1 : 0;
}

sub setEnhanceEnabled {
    my ($on) = @_;
    $prefs->set('sessionEnhance', $on ? 1 : 0);
    if (!$on) {
        foreach my $pid (keys %openPlay) {
            _closeOpenPlay($pid, time());
        }
        %openPlay = ();
    }
    return isEnhanceEnabled();
}

sub storeInfo {
    return {
        enhance => isEnhanceEnabled(),
        backend => $useFileFallback ? 'file' : ($dbh ? 'sqlite' : 'none'),
        path    => $useFileFallback ? ($filePath || '') : ($dbPath || ''),
    };
}

# --- storage ---------------------------------------------------------------

sub _prefsDir {
    my $dir = catdir(Slim::Utils::Prefs::dir(), 'material-skin');
    eval { make_path($dir) };
    return $dir;
}

sub _openStore {
    $dbPath = catfile(_prefsDir(), 'sessions.db');
    $filePath = catfile(_prefsDir(), 'sessions.jsonl');
    $useFileFallback = 0;
    $dbh = undef;

    eval {
        $dbh = DBI->connect(
            "dbi:SQLite:dbname=$dbPath",
            '', '',
            {
                RaiseError     => 1,
                PrintError     => 0,
                sqlite_unicode => 1,
                AutoCommit     => 1,
            }
        );
        $dbh->do('PRAGMA journal_mode=WAL');
        $dbh->do(q{
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id TEXT NOT NULL,
                ts INTEGER NOT NULL,
                event TEXT NOT NULL,
                url TEXT,
                title TEXT,
                context_type TEXT,
                context_id TEXT,
                context_title TEXT,
                context_url TEXT,
                context_image TEXT,
                seconds INTEGER DEFAULT 0,
                urlmd5 TEXT
            )
        });
        $dbh->do('CREATE INDEX IF NOT EXISTS sessions_player_ts ON sessions(player_id, ts)');
        $dbh->do('CREATE INDEX IF NOT EXISTS sessions_ctx_ts ON sessions(context_type, ts)');
        $dbh->do(q{
            CREATE TABLE IF NOT EXISTS player_context (
                player_id TEXT PRIMARY KEY,
                context_type TEXT,
                context_id TEXT,
                context_title TEXT,
                context_url TEXT,
                context_image TEXT,
                updated INTEGER
            )
        });
        1;
    };
    if ($@ || !$dbh) {
        $log->warn("SessionLog: SQLite unavailable ($@) — using file fallback");
        eval { $dbh->disconnect if $dbh; };
        $dbh = undef;
        $useFileFallback = 1;
    }
}

sub _pruneTimer {
    eval { pruneOld(); };
    Slim::Utils::Timers::setTimer(undef, Time::HiRes::time() + 24 * 3600, \&_pruneTimer);
}

sub pruneOld {
    my $cutoff = time() - (SESSION_RETENTION_DAYS * 86400);
    if ($dbh) {
        eval {
            $dbh->do('DELETE FROM sessions WHERE ts < ?', undef, $cutoff);
        };
    }
    # File fallback: rewrite keeping recent lines
    if ($useFileFallback && $filePath && -f $filePath) {
        eval {
            open(my $in, '<', $filePath) or return;
            my @keep;
            while (my $line = <$in>) {
                chomp $line;
                next unless length $line;
                if ($line =~ /"ts"\s*:\s*(\d+)/ && $1 >= $cutoff) {
                    push @keep, $line;
                }
            }
            close $in;
            open(my $out, '>', $filePath) or return;
            print $out join("\n", @keep), (@keep ? "\n" : '');
            close $out;
        };
    }
}

sub clearAll {
    %openPlay = ();
    if ($dbh) {
        eval {
            $dbh->do('DELETE FROM sessions');
            $dbh->do('DELETE FROM player_context');
        };
        return !$@;
    }
    if ($filePath && -f $filePath) {
        unlink $filePath;
    }
    # also clear sticky context file companion
    my $ctxFile = catfile(_prefsDir(), 'player_context.json');
    unlink $ctxFile if -f $ctxFile;
    return 1;
}

# --- context sticky (controller hints) -------------------------------------

sub setContext {
    my ($playerId, $type, $id, $title, $url, $image) = @_;
    return 0 unless isEnhanceEnabled();
    return 0 unless $playerId && $type;

    $type = lc($type);
    $type = 'radio' if $type eq 'stream' || $type eq 'station';
    # Never sticky-store a raw stream segment name as the station title
    if ($type eq 'radio') {
        $title = niceRadioTitle($url // $id // '', $title // '');
    }
    my $now = time();

    if ($dbh) {
        eval {
            $dbh->do(q{
                INSERT OR REPLACE INTO player_context
                    (player_id, context_type, context_id, context_title, context_url, context_image, updated)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            }, undef, $playerId, $type, $id // '', $title // '', $url // '', $image // '', $now);
        };
        return !$@;
    }

    # file fallback: small json map
    my $ctxFile = catfile(_prefsDir(), 'player_context.json');
    my $map = {};
    if (-f $ctxFile) {
        eval {
            open(my $fh, '<', $ctxFile) or die $!;
            local $/;
            my $raw = <$fh>;
            close $fh;
            $map = decode_json($raw) if $raw;
        };
        $map = {} unless ref $map eq 'HASH';
    }
    $map->{$playerId} = {
        context_type  => $type,
        context_id    => $id // '',
        context_title => $title // '',
        context_url   => $url // '',
        context_image => $image // '',
        updated       => $now,
    };
    eval {
        open(my $fh, '>', $ctxFile) or die $!;
        print $fh encode_json($map);
        close $fh;
    };
    return 1;
}

sub clearContext {
    my ($playerId) = @_;
    return unless $playerId;
    if ($dbh) {
        eval { $dbh->do('DELETE FROM player_context WHERE player_id = ?', undef, $playerId); };
        return;
    }
    my $ctxFile = catfile(_prefsDir(), 'player_context.json');
    return unless -f $ctxFile;
    my $map = {};
    eval {
        open(my $fh, '<', $ctxFile) or die $!;
        local $/;
        my $raw = <$fh>;
        close $fh;
        $map = decode_json($raw) if $raw;
    };
    if (ref $map eq 'HASH') {
        delete $map->{$playerId};
        eval {
            open(my $fh, '>', $ctxFile) or die $!;
            print $fh encode_json($map);
            close $fh;
        };
    }
}

sub getContext {
    my ($playerId) = @_;
    return unless $playerId;
    my $now = time();
    if ($dbh) {
        my $row;
        eval {
            my $sth = $dbh->prepare_cached(q{
                SELECT context_type, context_id, context_title, context_url, context_image, updated
                FROM player_context WHERE player_id = ?
            });
            $sth->execute($playerId);
            $row = $sth->fetchrow_hashref;
            $sth->finish;
        };
        return unless $row && $row->{context_type};
        if ($row->{updated} && ($now - $row->{updated}) > CONTEXT_STICKY_SECS) {
            clearContext($playerId);
            return;
        }
        return $row;
    }
    my $ctxFile = catfile(_prefsDir(), 'player_context.json');
    return unless -f $ctxFile;
    my $map = {};
    eval {
        open(my $fh, '<', $ctxFile) or die $!;
        local $/;
        my $raw = <$fh>;
        close $fh;
        $map = decode_json($raw) if $raw;
    };
    return unless ref $map eq 'HASH' && $map->{$playerId};
    my $row = $map->{$playerId};
    if ($row->{updated} && ($now - $row->{updated}) > CONTEXT_STICKY_SECS) {
        clearContext($playerId);
        return;
    }
    return $row;
}

# --- classify URL when no sticky context -----------------------------------

# True when a "title" is just a raw stream segment / file name (e.g. Radio Paradise "4-1.flac").
sub isAudioFilenameTitle {
    my ($title) = @_;
    return 0 unless defined $title && length $title;
    my $t = $title;
    $t =~ s/^\s+|\s+$//g;
    return 1 if $t =~ m{\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?)(\?.*)?$}i;
    return 1 if $t =~ m{^\d+[-_.]\d+\.(flac|mp3|m4a)$}i;
    return 0;
}

# Radio Paradise channel slug → display name (title); brand is the subtitle.
sub radioParadiseChannel {
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
    if (length $title && !isAudioFilenameTitle($title)
        && $title =~ m{mellow|rock|global|eclectic|main\s*mix|mix}i
        && $title !~ m{^radio\s*paradise$}i) {
        my $t = $title;
        $t =~ s{^\s*radio\s*paradise\s*[:\-–—]?\s*}{}i;
        $channel = $t if length $t;
    }
    return ($channel, 'Radio Paradise', '/material/html/images/radioparadise.svg');
}

# Prefer a human station / channel name over track-segment filenames or bare URLs.
# Returns channel/station title only (use radioParadiseChannel for brand + icon).
sub niceRadioTitle {
    my ($url, $title) = @_;
    $url   //= '';
    $title //= '';
    $title =~ s/^\s+|\s+$//g if length $title;
    my ($rpTitle) = radioParadiseChannel($url, $title);
    return $rpTitle if defined $rpTitle;
    if (length $title && !isAudioFilenameTitle($title) && $title !~ m{^https?://}i) {
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

sub classifyUrl {
    my ($url) = @_;
    return ('unknown', '', '', $url // '') unless $url;
    my $u = $url;
    if ($u =~ m{^podcast://}i || $u =~ m{^podcast:}i) {
        return ('podcast', '', '', $u);
    }
    if ($u =~ m{^radioparadise:}i || $u =~ m{radioparadise}i) {
        return ('radio', '', niceRadioTitle($u, ''), $u);
    }
    if ($u =~ m{^randomplay:}i) {
        my $mix = $u;
        $mix =~ s{^randomplay://?}{}i;
        return ('random', $mix, $mix, $u);
    }
    if ($u =~ m{^(http|https|mms|rtsp|rtmp):}i) {
        # remote stream / radio-ish
        if ($u =~ m{\.(mp3|flac|m4a|ogg|opus|wav|aiff?)(\?|$)}i
            && $u !~ m{(pls|m3u|xspf|stream|listen|tune|radio|icy|radioparadise)}i) {
            return ('unknown', '', '', $u);
        }
        return ('radio', '', niceRadioTitle($u, ''), $u);
    }
    # library / spotify etc. — leave to LMS album ranking unless sticky context
    return ('unknown', '', '', $u);
}

# --- event write -----------------------------------------------------------

sub _insertSession {
    my (%e) = @_;
    $e{ts} ||= time();
    $e{player_id} ||= '';
    $e{event} ||= 'track';
    $e{seconds} = int($e{seconds} || 0);
    $e{urlmd5} = $e{url} ? md5_hex($e{url}) : '';

    if ($dbh) {
        my $id;
        eval {
            $dbh->do(q{
                INSERT INTO sessions
                    (player_id, ts, event, url, title, context_type, context_id,
                     context_title, context_url, context_image, seconds, urlmd5)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            }, undef,
                $e{player_id}, $e{ts}, $e{event}, $e{url} // '', $e{title} // '',
                $e{context_type} // '', $e{context_id} // '', $e{context_title} // '',
                $e{context_url} // '', $e{context_image} // '', $e{seconds}, $e{urlmd5}
            );
            $id = $dbh->last_insert_id(undef, undef, 'sessions', 'id');
        };
        if ($@) {
            $log->error("SessionLog insert: $@");
            return;
        }
        return $id;
    }

    # file fallback
    eval {
        open(my $fh, '>>', $filePath) or die $!;
        my $line = encode_json({
            player_id     => $e{player_id},
            ts            => $e{ts},
            event         => $e{event},
            url           => $e{url} // '',
            title         => $e{title} // '',
            context_type  => $e{context_type} // '',
            context_id    => $e{context_id} // '',
            context_title => $e{context_title} // '',
            context_url   => $e{context_url} // '',
            context_image => $e{context_image} // '',
            seconds       => $e{seconds},
        });
        print $fh $line, "\n";
        close $fh;
    };
    return 1;
}

sub _updateSessionSeconds {
    my ($rowId, $seconds) = @_;
    return unless $rowId && $dbh;
    eval {
        $dbh->do('UPDATE sessions SET seconds = ? WHERE id = ?', undef, int($seconds), $rowId);
    };
}

sub _closeOpenPlay {
    my ($playerId, $now) = @_;
    my $open = delete $openPlay{$playerId};
    return unless $open && $open->{started};
    my $sec = int(($now || time()) - $open->{started});
    return if $sec < MIN_TRACK_SECONDS;
    if ($open->{row_id} && $dbh) {
        _updateSessionSeconds($open->{row_id}, $sec);
    } else {
        # file store: write a close event with seconds
        _insertSession(
            player_id     => $playerId,
            ts            => $now || time(),
            event         => 'track_end',
            url           => $open->{url},
            title         => $open->{title},
            context_type  => $open->{context_type},
            context_id    => $open->{context_id},
            context_title => $open->{context_title},
            context_url   => $open->{context_url},
            context_image => $open->{context_image},
            seconds       => $sec,
        );
    }
}

# --- LMS player subscriptions ----------------------------------------------

sub _onPlaylistNewsong {
    my $request = shift;
    return unless isEnhanceEnabled();
    my $client = $request->client() || return;
    my $playerId = $client->id() || return;
    my $now = time();

    _closeOpenPlay($playerId, $now);

    my $url = Slim::Player::Playlist::url($client);
    $url = '' unless defined $url;
    my $title = '';
    eval {
        my $track = Slim::Player::Playlist::track($client);
        if ($track) {
            $title = $track->title if $track->can('title') && $track->title;
            $url ||= $track->url if $track->can('url');
        }
    };
    return unless $url;

    my $ctx = getContext($playerId);
    my ($ctype, $cid, $ctitle, $curl, $cimage) = ('', '', '', '', '');
    if ($ctx && $ctx->{context_type} && $ctx->{context_type} ne 'unknown') {
        $ctype  = $ctx->{context_type};
        $cid    = $ctx->{context_id} // '';
        $ctitle = $ctx->{context_title} // '';
        $curl   = $ctx->{context_url} // '';
        $cimage = $ctx->{context_image} // '';
    } else {
        ($ctype, $cid, $ctitle, $curl) = classifyUrl($url);
        # For pure library tracks without sticky context, still log as track
        # so duration exists, but context_type stays unknown (albums use LMS).
    }

    # Refresh sticky timestamp while playing same context
    if ($ctx && $ctx->{context_type}) {
        setContext($playerId, $ctype || $ctx->{context_type}, $cid || $ctx->{context_id},
            $ctitle || $ctx->{context_title}, $curl || $ctx->{context_url}, $cimage || $ctx->{context_image});
    }

    my $rowId = _insertSession(
        player_id     => $playerId,
        ts            => $now,
        event         => 'track',
        url           => $url,
        title         => $title,
        context_type  => $ctype,
        context_id    => $cid,
        context_title => $ctitle,
        context_url   => $curl,
        context_image => $cimage,
        seconds       => 0,
    );

    $openPlay{$playerId} = {
        row_id        => $rowId,
        started       => $now,
        url           => $url,
        title         => $title,
        context_type  => $ctype,
        context_id    => $cid,
        context_title => $ctitle,
        context_url   => $curl,
        context_image => $cimage,
    };
}

sub _onPlaylistStopish {
    my $request = shift;
    return unless isEnhanceEnabled();
    my $client = $request->client() || return;
    my $playerId = $client->id() || return;
    my $cmd = $request->getRequest(1) || '';
    _closeOpenPlay($playerId, time());
    if ($cmd eq 'clear') {
        clearContext($playerId);
    }
}

# --- aggregation for context-stats -----------------------------------------

sub recentContexts {
    my ($playerId, $limit, $windowSecs) = @_;
    $limit = int($limit || 12);
    $limit = 4 if $limit < 1;
    $limit = 32 if $limit > 32;
    $windowSecs ||= 14 * 86400;
    my $cutoff = time() - $windowSecs;
    my @rows;

    if ($dbh) {
        eval {
            my $sql;
            my @bind;
            if ($playerId) {
                $sql = q{
                    SELECT context_type, context_id, context_title, context_url, context_image,
                           MAX(ts) AS last_played,
                           SUM(CASE WHEN seconds > 0 THEN seconds ELSE 0 END) AS total_seconds,
                           COUNT(*) AS plays
                    FROM sessions
                    WHERE ts >= ?
                      AND context_type IN ('playlist','radio','podcast','random')
                      AND player_id = ?
                    GROUP BY context_type,
                             COALESCE(NULLIF(context_id,''), NULLIF(context_url,''), url)
                    ORDER BY last_played DESC
                    LIMIT ?
                };
                @bind = ($cutoff, $playerId, $limit * 2);
            } else {
                $sql = q{
                    SELECT context_type, context_id, context_title, context_url, context_image,
                           MAX(ts) AS last_played,
                           SUM(CASE WHEN seconds > 0 THEN seconds ELSE 0 END) AS total_seconds,
                           COUNT(*) AS plays
                    FROM sessions
                    WHERE ts >= ?
                      AND context_type IN ('playlist','radio','podcast','random')
                    GROUP BY context_type,
                             COALESCE(NULLIF(context_id,''), NULLIF(context_url,''), url)
                    ORDER BY last_played DESC
                    LIMIT ?
                };
                @bind = ($cutoff, $limit * 2);
            }
            my $sth = $dbh->prepare($sql);
            $sth->execute(@bind);
            while (my $r = $sth->fetchrow_hashref) {
                next unless $r->{context_type};
                push @rows, $r;
                last if scalar @rows >= $limit;
            }
            $sth->finish;
        };
        if ($@) {
            $log->error("SessionLog recentContexts: $@");
        }
        return \@rows;
    }

    # file fallback scan
    return \@rows unless $filePath && -f $filePath;
    my %agg;
    eval {
        open(my $fh, '<', $filePath) or die $!;
        while (my $line = <$fh>) {
            chomp $line;
            next unless length $line;
            my $e = eval { decode_json($line) };
            next unless ref $e eq 'HASH';
            next if $playerId && ($e->{player_id} || '') ne $playerId;
            next unless ($e->{ts} || 0) >= $cutoff;
            my $ctype = $e->{context_type} || '';
            next unless $ctype eq 'playlist' || $ctype eq 'radio' || $ctype eq 'podcast' || $ctype eq 'random';
            my $key = $ctype . "\t" . ($e->{context_id} || $e->{context_url} || $e->{url} || '');
            my $a = $agg{$key} ||= {
                context_type  => $ctype,
                context_id    => $e->{context_id} || '',
                context_title => $e->{context_title} || '',
                context_url   => $e->{context_url} || $e->{url} || '',
                context_image => $e->{context_image} || '',
                last_played   => 0,
                total_seconds => 0,
                plays         => 0,
            };
            $a->{last_played} = $e->{ts} if ($e->{ts} || 0) > ($a->{last_played} || 0);
            $a->{total_seconds} += int($e->{seconds} || 0);
            $a->{plays}++;
            $a->{context_title} = $e->{context_title} if $e->{context_title};
            $a->{context_image} = $e->{context_image} if $e->{context_image};
        }
        close $fh;
    };
    @rows = sort { ($b->{last_played} || 0) <=> ($a->{last_played} || 0) } values %agg;
    splice(@rows, $limit) if @rows > $limit;
    return \@rows;
}

sub sessionCards {
    my ($playerId, $limit, $windowSecs) = @_;
    my $rows = recentContexts($playerId, $limit, $windowSecs) || [];
    my @cards;
    foreach my $r (@$rows) {
        my $card = _rowToCard($r);
        push @cards, $card if $card;
    }
    return @cards;
}

sub _formatDuration {
    my ($sec) = @_;
    $sec = int($sec || 0);
    return '' if $sec < 60;
    if ($sec < 3600) {
        return int($sec / 60) . 'm';
    }
    my $h = int($sec / 3600);
    my $m = int(($sec % 3600) / 60);
    return $m > 0 ? "${h}h ${m}m" : "${h}h";
}

sub _rowToCard {
    my ($r) = @_;
    my $type = $r->{context_type} || '';
    my $title = $r->{context_title} || '';
    my $url = $r->{context_url} || '';
    my $id = $r->{context_id} || '';
    my $image = $r->{context_image} || '';
    my $last = int($r->{last_played} || 0);
    my $secs = int($r->{total_seconds} || 0);
    my $dur = _formatDuration($secs);

    if ($type eq 'playlist') {
        return unless $id || $title || $url;
        my $pid = $id;
        $pid =~ s/^playlist_id://i;
        # Normalise Spotty URI forms
        my $playUrl = $url || '';
        $playUrl = $pid if !$playUrl && $pid !~ /^\d+$/;
        $playUrl =~ s{^spotify://playlist:}{spotify:playlist:}i if $playUrl;
        $pid =~ s{^spotify://playlist:}{spotify:playlist:}i if $pid;

        # LMS library playlist (numeric id)
        if (defined $pid && $pid =~ /^\d+$/) {
            # ASCII separator only — UTF-8 middle-dot can mojibake as "Â·" in some clients
            my $sub = $dur ? "Playlist - $dur" : 'Playlist';
            return {
                id          => 'cstats.playlist.' . $pid,
                type        => 'playlist',
                title       => $title || ('Playlist ' . $pid),
                subtitle    => $sub,
                image       => $image || '',
                progress    => 0,
                play_cmd    => 'playlistcontrol',
                play_param1 => 'cmd:load',
                play_param2 => 'playlist_id:' . $pid,
                last_played => $last,
                from_session => 1,
            };
        }

        # Spotty / remote playlist (spotify:playlist:… or other URI)
        return unless $playUrl || $title;
        $playUrl = $playUrl || $pid || '';
        my $isSpotify = ($playUrl =~ m{^spotify:playlist:}i) ? 1 : 0;
        my $key = $playUrl || $title;
        my $sub = $isSpotify
            ? ($dur ? "Spotify - $dur" : 'Spotify')
            : ($dur ? "Playlist - $dur" : 'Playlist');
        return {
            id          => 'cstats.playlist.' . md5_hex($key),
            type        => 'playlist',
            title       => $title || ($isSpotify ? 'Spotify playlist' : $playUrl),
            subtitle    => $sub,
            image       => $image || '',
            progress    => 0,
            # Spotty protocol handler accepts playlist play of spotify:playlist:…
            play_cmd    => 'playlist',
            play_param1 => 'play',
            play_param2 => $playUrl,
            play_param3 => $title || '',
            last_played => $last,
            from_session => 1,
            is_spotify  => $isSpotify,
        };
    }

    if ($type eq 'radio') {
        my $playUrl = $url || $id;
        return unless $playUrl;
        my ($rpTitle, $rpSub, $rpImg) = radioParadiseChannel($playUrl, $title);
        if (defined $rpTitle) {
            $title = $rpTitle;
            $image = $rpImg if $rpImg;
        } else {
            $title = niceRadioTitle($playUrl, $title);
        }
        my $sub = $rpSub
            ? ($dur ? "$rpSub - $dur" : $rpSub)
            : ($dur ? "Radio - $dur" : 'Radio');
        $image ||= '/html/images/radio.png';
        return {
            id          => 'cstats.radio.' . md5_hex($playUrl),
            type        => 'radio',
            title       => $title,
            subtitle    => $sub,
            image       => $image,
            progress    => 0,
            play_cmd    => 'playlist',
            play_param1 => 'play',
            play_param2 => $playUrl,
            play_param3 => $title,
            last_played => $last,
            from_session => 1,
        };
    }

    if ($type eq 'podcast') {
        my $playUrl = $url || $id;
        return unless $playUrl;
        my $bare = $playUrl;
        $bare =~ s{^podcast://}{}i;
        $title ||= $bare;
        $title =~ s{^.*/}{} if $title eq $bare;
        my $sub = $dur ? "Podcast - $dur" : 'Podcast';
        $image ||= '/html/images/podcast.png';
        my $p2 = ($playUrl =~ m{^podcast://}i) ? $playUrl : ('podcast://' . $bare);
        return {
            id          => 'cstats.podcast.' . md5_hex($bare),
            type        => 'podcast',
            title       => $title,
            subtitle    => $sub,
            image       => $image,
            progress    => 0,
            play_cmd    => 'playlist',
            play_param1 => 'play',
            play_param2 => $p2,
            last_played => $last,
            from_session => 1,
        };
    }

    if ($type eq 'random') {
        my $mix = $id || $title || 'mix';
        my $sub = $dur ? "Random - $dur" : 'Random mix';
        return {
            id          => 'cstats.random.' . md5_hex($mix),
            type        => 'radio', # play via randomplay if possible
            title       => $title || $mix,
            subtitle    => $sub,
            image       => $image || '/html/images/random.png',
            progress    => 0,
            play_cmd    => 'randomplay',
            play_param1 => $mix,
            last_played => $last,
            from_session => 1,
        };
    }

    return;
}

1;
