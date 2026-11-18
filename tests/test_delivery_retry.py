"""The final public check retries transport errors, never incorrect content."""
import importlib.util
from pathlib import Path
import ssl
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('delivery', Path(__file__).resolve().parents[1] / 'scripts/check-deployed-release.py')
delivery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delivery)


class DeliveryRetryTests(unittest.TestCase):
    def test_read_only_check_recovers_from_transient_failure(self):
        error = urllib.error.HTTPError('https://example.test', 503, 'unavailable', {}, None)
        with patch.object(delivery, 'check_once', side_effect=[error, {'entryVerified': True}]) as check, patch.object(delivery.time, 'sleep'), patch('builtins.print'):
            self.assertEqual(delivery.check(Path('.')), {'entryVerified': True})
            self.assertEqual(check.call_count, 2)

    def test_invalid_content_permissions_and_tls_fail_immediately(self):
        errors = [ValueError('wrong release'), urllib.error.HTTPError('https://example.test', 403, 'denied', {}, None), urllib.error.URLError(ssl.SSLError('certificate'))]
        for error in errors:
            with patch.object(delivery, 'check_once', side_effect=error) as check, patch.object(delivery.time, 'sleep') as sleep:
                with self.assertRaises(type(error)):
                    delivery.check(Path('.'))
                self.assertEqual(check.call_count, 1)
                sleep.assert_not_called()

    def test_network_outage_has_a_retry_limit(self):
        with patch.object(delivery, 'check_once', side_effect=TimeoutError()) as check, patch.object(delivery.time, 'sleep'), patch('builtins.print'):
            with self.assertRaises(TimeoutError):
                delivery.check(Path('.'))
            self.assertEqual(check.call_count, 4)
