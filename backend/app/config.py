from pathlib import Path
from pydantic_settings import BaseSettings, PydanticBaseSettingsSource, SettingsConfigDict

# Resolve .env relative to the backend folder so it works regardless of CWD.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ):
        # Prefer .env file over process env vars — a Claude Code parent process
        # injects an empty ANTHROPIC_API_KEY that otherwise masks the file value.
        return init_settings, dotenv_settings, env_settings, file_secret_settings

    vault_root: Path = Path("C:/bsc-vault")
    db_path: Path = Path("C:/bsc-vault/db/bsc.sqlite")

    anthropic_api_key: str = ""
    openai_api_key: str = ""

    vision_model: str = "claude-sonnet-4-6"
    whisper_model: str = "whisper-1"

    max_ingest_rows: int = 100
    download_concurrency: int = 8
    download_timeout_seconds: int = 300
    mapping_duration_tolerance_seconds: float = 2.0

    per_asset_tagging_budget_inr: float = 2.0
    monthly_tagging_budget_inr: float = 5000.0

    @property
    def videos_dir(self) -> Path:
        return self.vault_root / "videos"

    @property
    def frames_dir(self) -> Path:
        return self.vault_root / "frames"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"


settings = Settings()
