# Deployment platforms

The code calls the Anthropic API by default. A deployment points the runtime at GCP
Vertex AI, AWS Bedrock, Microsoft Foundry, or an in-house gateway instead by changing
one place: the client the agent is constructed with.

## Support matrix

| Path | Anthropic API | GCP Vertex AI | AWS Bedrock | Microsoft Foundry | In-house gateway |
|---|---|---|---|---|---|
| Messages API runtime (`ShoppingAgent`) | Yes | Yes | Yes | Yes | Yes |

## Model ids

The model is a string in the config: `model` and `memory_model`. Nothing else reads the
string, so a platform move is a config change. Id grammar differs by platform; confirm
against your platform's catalog.

| Field | Repo default | Anthropic API, gateways | GCP Vertex AI | AWS Bedrock (Mantle) | AWS Bedrock (Invoke API) | Microsoft Foundry |
|---|---|---|---|---|---|---|
| `model` | `claude-sonnet-5` | `claude-sonnet-5` | `claude-sonnet-5` | `anthropic.<SERVED_MODEL>` | `<INFERENCE_PROFILE_ID>` | `claude-sonnet-5` |
| `memory_model` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5@20251001` | `anthropic.<SERVED_MODEL>` | `<INFERENCE_PROFILE_ID>` | `claude-haiku-4-5` |

- Vertex writes dated snapshots with `@`.
- Bedrock has two endpoints. Mantle speaks the Messages API and takes dateless
  `anthropic.` ids from its own lineup; the Invoke API takes inference-profile ids from your account's catalog
  (region-prefixed, dated, `-v1:0` suffixed).
- Foundry takes the name of a deployment in your resource; the values above are the
  defaults, which match the dateless first-party ids.
- Both model fields go through the same client, so both must exist on the platform it
  targets. The demo reads `SHOPPING_MODEL` and `SHOPPING_MEMORY_MODEL` from its `.env`
  for exactly this move.

## The `client` argument

`ShoppingAgent` takes an optional `client`. Without one it constructs `AsyncAnthropic`,
which reads `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_BASE_URL` from
the environment; exporting them points the demo API at a gateway. With one, every call
uses it: the turn loop (`messages.stream`) and memory extraction (`messages.create`).
Any async client in the `anthropic` package fits. The parameter is annotated
`AsyncAnthropic`, so a type checker needs a `cast` for the platform classes.

```python
from pathlib import Path

from anthropic import (
    AsyncAnthropic,
    AsyncAnthropicBedrockMantle,
    AsyncAnthropicFoundry,
    AsyncAnthropicVertex,
)
from shopping_agent import ShoppingAgentConfig
from shopping_agent_runtime import ShoppingAgent

common = dict(backend=your_backend, skills_dir=Path("shopping-agent/skills"))

# GCP Vertex AI: pip install "anthropic[vertex]"; Application Default Credentials.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(memory_model="claude-haiku-4-5@20251001"),
    client=AsyncAnthropicVertex(project_id="your-project", region="global"),
)

# AWS Bedrock, Mantle endpoint: the standard AWS credential chain.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(
        model="anthropic.your-served-model", memory_model="anthropic.claude-haiku-4-5"
    ),
    client=AsyncAnthropicBedrockMantle(aws_region="us-east-1"),
)

# Microsoft Foundry: an Azure API key, or azure_ad_token_provider= for Entra ID.
agent = ShoppingAgent(
    **common,
    config=ShoppingAgentConfig(memory_model="claude-haiku-4-5"),
    client=AsyncAnthropicFoundry(resource="your-resource", api_key="your-azure-key"),
)

# In-house gateway: it must serve /v1/messages with SSE streaming.
agent = ShoppingAgent(
    **common,
    client=AsyncAnthropic(base_url="https://llm-gateway.internal.example", auth_token="your-token"),
)
```

The packages declare `anthropic>=0.91`, the release that adds `AsyncAnthropicBedrockMantle`,
the newest of the client classes above.

A gateway must speak the Anthropic Messages API: the SDK posts to
`{ANTHROPIC_BASE_URL}/v1/messages` with SSE streaming, so write the base URL without
`/v1`. An OpenAI-format endpoint (`/v1/chat/completions`) does not work; a multi-format
gateway must expose its Anthropic-compatible endpoint. `ANTHROPIC_AUTH_TOKEN` sends a
`Bearer` header and `ANTHROPIC_API_KEY` sends `x-api-key`; use whichever the gateway
expects, and leave the other blank.

## What the tests cover

No test holds cloud credentials, so no live platform conversation runs here; run one on
your platform before relying on it. To drive the agent with no credentials at all,
script the model with `commerce_common.testing.FakeClient`.
