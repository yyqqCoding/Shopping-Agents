# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The mechanisms the shopping agent builds on. Import from the submodules:

``config``            ``BaseAgentConfig`` and the model defaults
``types``             ``MemoryFact``, ``MemoryCategory``, ``ClockContext``
``fencing``           ``Fence``, chip and display-text hygiene
``memory``            ``MemoryStore``, the write filter, extraction, ``MemoryRuntime``
``skills``            ``SkillRegistry``
``prompt_assembly``   cache breakpoints: system block, tool array, rolling conversation
``grounding``         ``GroundingRule`` and the lexicon matchers
``presentation``      ``PresentationComponent``, ``PresentationExtension``, the runner
``delegation``        ``DelegateExtension``
``execution``         ``BaseToolExecutor``, the frame the executor extends
``streaming``         ``AgentEvent``, ``ToolOutcome``, ``to_sse``
``turn``              helpers for the Messages API turn loop
``testing``           a scripted fake model client
"""
