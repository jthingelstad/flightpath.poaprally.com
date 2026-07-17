import os
import unittest

os.environ.setdefault("POAP_CLIENT_ID", "test-client")
os.environ.setdefault("POAP_CLIENT_SECRET", "test-secret")
os.environ.setdefault("POAP_API_KEY", "test-key")

from scripts import fetch_data


class FetchDataTests(unittest.TestCase):
    def test_parse_poap_owner_object(self):
        address, ens = fetch_data.parse_poap_owner(
            {"owner": {"id": "0xABCDEF", "ens": "traveler.eth"}}
        )

        self.assertEqual(address, "0xabcdef")
        self.assertEqual(ens, "traveler.eth")

    def test_parse_poap_owner_string(self):
        self.assertEqual(
            fetch_data.parse_poap_owner({"owner": "0xABCDEF"}),
            ("0xabcdef", ""),
        )

    def test_slugify_normalizes_team_names(self):
        self.assertEqual(fetch_data.slugify("POAP & Friends!"), "poap-friends")

    def test_api_headers_include_bearer_and_api_key(self):
        self.assertEqual(
            fetch_data.api_headers("token"),
            {
                "Accept": "application/json",
                "Authorization": "Bearer token",
                "X-API-Key": "test-key",
            },
        )


if __name__ == "__main__":
    unittest.main()
