"""Exercise real Git histories so the guard catches both conflicts and silent mismerges."""

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import subprocess
import tempfile
import unittest

from check_promotion import check_promotion


def config(admin=False, staging=True):
    name = "clc-admin" if admin else "clc-app"
    if staging:
        name += "-gnosis"
    api = "https://gnosis-staging.cosmolocal.credit" if staging else "https://api.cosmolocal.credit"
    values = f'''VITE_API_URL = "{api}"
VITE_BRAND = "{'staging' if staging else 'prod'}"
VITE_PAPER_WALLET_ORIGIN = "https://{'test' if staging else 'app'}.cosmolocal.credit"
VITE_RELAYER_URL = "{api}/api/v2/relayer"
VITE_STORAGE_URL = "https://{'gnosis-storage' if staging else 'storage'}.cosmolocal.credit"
'''
    if not admin:
        values += f'VITE_FULL_REACT_ERRORS = "{"true" if staging else "false"}"\n'
    relying_party = "test.cosmolocal.credit" if staging else "cosmolocal.credit"
    return f'''# Shared header: keep this layout identical.
name = "{name}"
pages_build_output_dir = "{'dist' if admin else 'apps/web/dist'}"

[vars]
# Per environment
{values}VITE_RELYING_PARTY_ID = "{relying_party}"

# Shared
VITE_CHAIN_ID = "100"

[env.preview.vars]
# Per environment
{values}VITE_RELYING_PARTY_ID = "{name}.pages.dev"

# Shared
VITE_CHAIN_ID = "100"
'''


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="clc-promotion-test-")
        self.addCleanup(self.directory.cleanup)
        self.repo = Path(self.directory.name)
        self.git("init", "--initial-branch=develop")
        self.git("config", "user.name", "Promotion Test")
        self.git("config", "user.email", "promotion@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", "/dev/null")
        self.write_configs(staging=True)
        self.commit()
        self.git("checkout", "-b", "master")
        self.write_configs(staging=False)
        self.commit()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True, stderr=subprocess.PIPE)

    def write_configs(self, staging):
        for admin, path in ((False, "wrangler.toml"), (True, "apps/admin/wrangler.toml")):
            file = self.repo / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(config(admin, staging))

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-m", "Fixture change")

    def check(self):
        before = self.git("status", "--porcelain"), self.git("rev-parse", "HEAD")
        with redirect_stdout(StringIO()):
            check_promotion("master", "develop", self.repo)
        self.assertEqual(before, (self.git("status", "--porcelain"), self.git("rev-parse", "HEAD")))

    def test_existing_environment_split_passes(self):
        self.check()

    def test_shared_variable_promotes(self):
        self.git("checkout", "develop")
        for path in ("wrangler.toml", "apps/admin/wrangler.toml"):
            file = self.repo / path
            file.write_text(file.read_text().replace('VITE_CHAIN_ID = "100"', 'VITE_CHAIN_ID = "100"\nVITE_NEW_SHARED = "enabled"'))
        self.commit()
        self.check()

    def test_cleanup_comments_next_to_environment_values_conflict(self):
        self.git("checkout", "develop")
        file = self.repo / "wrangler.toml"
        file.write_text(file.read_text().replace("# Shared header: keep this layout identical.", "# Shorter header"))
        self.commit()
        with self.assertRaisesRegex(ValueError, "develop -> master conflicts"):
            self.check()

    def test_conflict_resolved_on_master_with_matching_layout_passes(self):
        self.git("checkout", "develop")
        file = self.repo / "wrangler.toml"
        file.write_text(file.read_text().replace("# Shared header: keep this layout identical.", "# Shorter header"))
        self.commit()
        self.git("checkout", "master")
        result = subprocess.run(["git", "merge", "--no-commit", "develop"], cwd=self.repo, capture_output=True)
        self.assertEqual(result.returncode, 1)
        file.write_text(config(staging=False).replace("# Shared header: keep this layout identical.", "# Shorter header"))
        self.commit()
        self.check()

    def test_silent_staging_overwrite_after_reverse_merge_is_rejected(self):
        self.git("checkout", "develop")
        self.git("merge", "master", "--no-commit")
        self.write_configs(staging=True)
        self.commit()
        with self.assertRaisesRegex(ValueError, "project name must be clc-app"):
            self.check()

    def test_wrong_prod_brand_is_rejected(self):
        file = self.repo / "wrangler.toml"
        file.write_text(file.read_text().replace('VITE_BRAND = "prod"', 'VITE_BRAND = "staging"'))
        self.commit()
        with self.assertRaisesRegex(ValueError, "VITE_BRAND must be 'prod'"):
            self.check()

    def test_admin_wrong_preview_relying_party_is_rejected(self):
        file = self.repo / "apps/admin/wrangler.toml"
        file.write_text(file.read_text().replace("clc-admin.pages.dev", "clc-admin-gnosis.pages.dev"))
        self.commit()
        with self.assertRaisesRegex(ValueError, "env.preview.vars.VITE_RELYING_PARTY_ID"):
            self.check()

    def test_missing_preview_variable_is_rejected(self):
        self.git("checkout", "develop")
        file = self.repo / "wrangler.toml"
        file.write_text(file.read_text().replace('# Shared\nVITE_CHAIN_ID = "100"', '# Shared\nVITE_CHAIN_ID = "100"\nVITE_ONLY_PRODUCTION = "missing-preview"', 1))
        self.commit()
        with self.assertRaisesRegex(ValueError, "preview must repeat all vars"):
            self.check()


if __name__ == "__main__":
    unittest.main()
