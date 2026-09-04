from pathlib import Path

import anyio
import pytest
from pydantic import SecretStr, ValidationError

from my_bot_ai.features.agent.contracts import GithubMcpConfig
from my_bot_ai.features.skills.capabilities import ToolRegistry, ToolSpec
from my_bot_ai.features.skills.loader import load_skill, scan_skills
from my_bot_ai.features.skills.mcp import github_mcp_tool
from my_bot_ai.features.skills.registry import default_skill_registry
from my_bot_ai.features.skills.resolution import resolve_skills, skill_guidance
from my_bot_ai.features.skills.tools import build_load_skill_tool


def test_scan_is_metadata_only_and_load_is_progressive(tmp_path: Path) -> None:
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    path = skill_dir / "SKILL.md"
    path.write_text(
        "---\nname: demo\ndescription: Demo\nallowed-tools: tool.read tool.write\n"
        "compatibility: local\nmetadata:\n  com.example.owner: test\n---\nsecret instructions",
        encoding="utf-8",
    )
    metadata = load_skill(path, include_body=False)
    assert metadata.description == "Demo"
    assert metadata.allowed_tools == ("tool.read", "tool.write")
    assert metadata.compatibility == "local"
    assert metadata.metadata == {"com.example.owner": "test"}
    assert not hasattr(metadata, "body")
    assert load_skill(path).body == "secret instructions"
    assert scan_skills(tmp_path)[0].id == "demo"


@pytest.mark.parametrize(
    ("field", "value"),
    [("allowed-tools", "[tool.read]"), ("metadata", "[not-a-map]")],
)
def test_invalid_frontmatter_types_are_rejected(tmp_path: Path, field: str, value: str) -> None:
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    path = skill_dir / "SKILL.md"
    path.write_text(
        f"---\nname: demo\ndescription: Demo\n{field}: {value}\n---\nbody",
        encoding="utf-8",
    )
    with pytest.raises(ValueError):
        load_skill(path)


def test_unsupported_frontmatter_and_long_compatibility_are_rejected(tmp_path: Path) -> None:
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    path = skill_dir / "SKILL.md"
    for field in ("id", "owner"):
        path.write_text(
            f"---\nname: demo\ndescription: Demo\n{field}: value\n---\nbody",
            encoding="utf-8",
        )
        with pytest.raises(ValueError, match="metadata"):
            load_skill(path)
    path.write_text(
        "---\nname: demo\ndescription: Demo\ncompatibility: " + "x" * 501 + "\n---\nbody",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="500"):
        load_skill(path)


def test_bundled_github_skill_resolves() -> None:
    registry = default_skill_registry()
    metadata = registry.get("github")
    assert metadata.description
    selected = resolve_skills(registry, ("github",))
    assert "destructive remote actions" in skill_guidance(selected)


def test_github_mcp_descriptor_is_explicit_and_secret_is_not_in_user_guidance() -> None:
    secret = "Bearer github-secret-value"
    descriptor = github_mcp_tool("https://mcp.github.example", SecretStr(secret))
    assert descriptor["type"] == "mcp"
    assert descriptor["server_label"] == "github"
    assert descriptor["authorization"] == secret
    assert descriptor["require_approval"] == "never"
    assert secret not in skill_guidance(resolve_skills(default_skill_registry(), ("github",)))
    assert github_mcp_tool("https://mcp.github.example", SecretStr(secret), allowed_tools=())[
        "allowed_tools"
    ] == []


def test_github_mcp_config_requires_https_and_safe_bounded_tools() -> None:
    config = GithubMcpConfig(
        server_url="https://mcp.github.example",
        authorization=SecretStr("secret"),
        account_login="octocat",
        allowed_tools=["search_repositories"],
    )
    assert config.allowed_tools == ["search_repositories"]
    assert GithubMcpConfig(
        server_url="https://mcp.github.example",
        authorization=SecretStr("secret"),
        account_login="octocat",
    ).allowed_tools is None
    with pytest.raises(ValidationError):
        GithubMcpConfig(
            server_url="http://mcp.github.example",
            authorization=SecretStr("secret"),
            account_login="octocat",
        )
    with pytest.raises(ValidationError):
        GithubMcpConfig(
            server_url="https://mcp.github.example",
            authorization=SecretStr("secret"),
            account_login="octocat",
            allowed_tools=["delete repository"],
        )
    with pytest.raises(ValidationError):
        GithubMcpConfig(
            server_url="https://mcp.github.example",
            authorization=SecretStr("secret"),
            account_login="invalid login",
        )


def test_tool_registry_is_authoritative_for_github_mcp_allowlist() -> None:
    registry = ToolRegistry((ToolSpec("search_repositories", connection="github"),))
    descriptor = github_mcp_tool(
        "https://mcp.github.example",
        SecretStr("secret"),
        allowed_tools=("search_repositories", "delete_repository"),
        tool_registry=registry,
    )
    assert descriptor["allowed_tools"] == ["search_repositories"]

    with pytest.raises(ValueError, match="not enabled"):
        github_mcp_tool(
            "https://mcp.github.example",
            SecretStr("secret"),
            tool_registry=ToolRegistry((ToolSpec("read_file", connection="other"),)),
        )


def test_load_skill_events_bracket_body_read_and_report_failures(
    tmp_path: Path, monkeypatch
) -> None:
    skill_dir = tmp_path / "demo"
    skill_dir.mkdir()
    path = skill_dir / "SKILL.md"
    path.write_text("---\nname: demo\ndescription: Demo\n---\nbody", encoding="utf-8")
    events: list[tuple[str, str]] = []

    async def dispatch(name: str, data: dict[str, object]) -> None:
        events.append((name, data["skill"]["status"]))  # type: ignore[index]

    monkeypatch.setattr("my_bot_ai.features.skills.tools.adispatch_custom_event", dispatch)
    from my_bot_ai.features.skills.registry import SkillRegistry

    tool = build_load_skill_tool(SkillRegistry((tmp_path,)))
    assert anyio.run(tool.ainvoke, {"skill_id": "demo"}) == "body"
    assert events == [("skill.started", "in_progress"), ("skill.completed", "completed")]
    path.unlink()
    with pytest.raises(FileNotFoundError):
        anyio.run(tool.ainvoke, {"skill_id": "demo"})
    assert events[-2:] == [("skill.started", "in_progress"), ("skill.completed", "failed")]
