from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ProductionReleaseContractTest(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        path = ROOT / relative_path
        self.assertTrue(path.is_file(), f"missing production release file: {relative_path}")
        return path.read_text(encoding="utf-8")

    def test_all_three_applications_have_production_dockerfiles(self) -> None:
        frontend = self.read("frontend/Dockerfile")
        business = self.read("backend/business/Dockerfile")
        ai = self.read("backend/ai/Dockerfile")

        self.assertIn("output: \"standalone\"", self.read("frontend/next.config.ts"))
        self.assertGreaterEqual(frontend.upper().count("FROM "), 2)
        self.assertIn("bootJar", business)
        self.assertIn("sed -i", business)
        self.assertNotIn("gradle.properties", business)
        self.assertIn("bge-small-zh", ai)
        self.assertIn("HF_HUB_OFFLINE", ai)

    def test_production_compose_keeps_data_private_and_persistent(self) -> None:
        compose = self.read("infra/docker-compose.prod.yml")

        for service in ("frontend:", "business:", "ai:", "mysql:", "redis:", "minio:", "caddy:"):
            self.assertIn(service, compose)
        for volume in ("mysql_data:", "redis_data:", "minio_data:", "caddy_data:"):
            self.assertIn(volume, compose)
        self.assertNotIn('"3306:3306"', compose)
        self.assertNotIn('"6379:6379"', compose)
        self.assertNotIn('"9000:9000"', compose)
        self.assertIn("SPRING_PROFILES_ACTIVE: prod", compose)

    def test_caddy_exposes_public_routes_but_blocks_internal_apis(self) -> None:
        caddy = self.read("infra/Caddyfile")

        self.assertIn("/api/v1/internal/*", caddy)
        self.assertIn("/internal/*", caddy)
        self.assertIn("respond @internal 404", caddy)
        self.assertIn("business:8080", caddy)
        self.assertIn("ai:8000", caddy)
        self.assertIn("/ws/interview/*", caddy)
        self.assertIn("flush_interval -1", caddy)

    def test_production_ai_receives_voice_provider_configuration(self) -> None:
        compose = self.read("infra/docker-compose.prod.yml")
        env = self.read("infra/.env.prod.example")

        required = (
            "ASR_PROVIDER",
            "DEEPGRAM_API_KEY",
            "DEEPGRAM_ASR_MODEL",
            "DEEPGRAM_ASR_LANGUAGE",
            "DEEPGRAM_ASR_ENDPOINT",
            "TTS_PROVIDER",
            "OPENAI_API_KEY",
            "OPENAI_BASE_URL",
            "OPENAI_TTS_MODEL",
            "OPENAI_TTS_VOICE",
        )
        for key in required:
            self.assertIn(f"{key}:", compose)
            self.assertIn(f"{key}=", env)

    def test_business_is_healthy_before_ai_recovery_workers_start(self) -> None:
        compose = self.read("infra/docker-compose.prod.yml")
        ai_block = compose.split("  ai:", 1)[1].split("  business:", 1)[0]
        business_block = compose.split("  business:", 1)[1].split("  frontend:", 1)[0]

        self.assertIn("business:", ai_block)
        self.assertIn("condition: service_healthy", ai_block)
        business_dependencies = business_block.split("depends_on:", 1)[1].split("healthcheck:", 1)[0]
        self.assertNotIn("ai:", business_dependencies)

    def test_example_environment_lists_required_production_secrets(self) -> None:
        env = self.read("infra/.env.prod.example")

        required = (
            "DOMAIN=",
            "MYSQL_ROOT_PASSWORD=",
            "MYSQL_PASSWORD=",
            "REDIS_PASSWORD=",
            "JWT_SECRET=",
            "AI_INTERNAL_TOKEN=",
            "ANTHROPIC_API_KEY=",
            "MAIL_MODE=smtp",
            "MAIL_HOST=",
            "MAIL_USERNAME=",
            "MAIL_PASSWORD=",
            "MINIO_ROOT_PASSWORD=",
        )
        for key in required:
            self.assertIn(key, env)
        self.assertNotIn("sk-ant-", env)

    def test_release_scripts_fail_fast_and_cover_deploy_backup_and_restore(self) -> None:
        deploy = self.read("infra/deploy.sh")
        backup = self.read("infra/backup.sh")

        self.assertIn("set -euo pipefail", deploy)
        self.assertIn("docker compose", deploy)
        self.assertIn("--wait", deploy)
        self.assertIn("MAIL_MODE", deploy)
        self.assertIn('"/api/v1/internal/ping"', deploy)
        self.assertIn('"/internal/ping"', deploy)
        self.assertIn("set -euo pipefail", backup)
        self.assertIn("mysqldump", backup)
        self.assertIn("mc mirror", backup)
        self.assertIn("--entrypoint sh", backup)
        self.assertNotIn("--entrypoint /bin/sh", backup)
        self.assertIn("cygpath -w", backup)
        self.assertIn("MSYS_NO_PATHCONV=1 docker run", backup)
        self.assertIn("--mount", backup)
        self.assertNotIn('source "$ENV_FILE"', deploy)
        self.assertNotIn('source "$ENV_FILE"', backup)
        self.assertIn('load_dotenv "$ENV_FILE"', deploy)
        self.assertIn('load_dotenv "$ENV_FILE"', backup)
        self.assertIn("find minio", backup)


if __name__ == "__main__":
    unittest.main()
