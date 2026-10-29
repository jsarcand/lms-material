package Plugins::WiimIntegration::Settings;

use strict;
use warnings;

use base qw(Slim::Web::Settings);
use Slim::Utils::Prefs;
use Slim::Utils::Log;

my $log   = logger('plugin.wiim_integration');
my $prefs = preferences('plugin.wiim_integration');

use constant SETTINGS_URL => 'plugins/WiimIntegration/settings/basic.html';

sub name {
	my $name = 'PLUGIN_WIIMINTEGRATION';
	return eval { Slim::Web::HTTP::CSRF->protectName($name) } || $name;
}

sub page {
	return eval { Slim::Web::HTTP::CSRF->protectURI(SETTINGS_URL) } || SETTINGS_URL;
}

sub prefs {
	return ($prefs, qw(polling_interval enable_upnp));
}

sub handler {
	my ($class, $client, $params, $callback, $httpClient, $response) = @_;

	# Unchecked checkboxes are omitted from the POST body.
	if ($params->{saveSettings}) {
		$params->{pref_enable_upnp} = $params->{pref_enable_upnp} ? 1 : 0;

		my $interval = $params->{pref_polling_interval};
		if (!defined $interval || $interval eq '' || $interval !~ /^\d+$/ || $interval < 4) {
			$params->{pref_polling_interval} = 4;
		}
		elsif ($interval > 30) {
			$params->{pref_polling_interval} = 30;
		}
	}

	# Never let optional helper data blank the whole page.
	$params->{wiim_preset_urls} = eval {
		Plugins::WiimIntegration::Plugin::getPresetUrls()
	} || [];

	if ($@) {
		$log->warn("Settings helper error (ignored): $@");
	}

	return $class->SUPER::handler($client, $params, $callback, $httpClient, $response);
}

1;
