import { describe, expect, it } from 'vitest';
import * as agent from './index';

describe('agent public exports', () => {
    it('exports the runtime skeleton modules', () => {
        expect(agent.runReadingAgent).toBeTypeOf('function');
        expect(agent.createReadingTools).toBeTypeOf('function');
        expect(agent.packDocumentContext).toBeTypeOf('function');
        expect(agent.createReadingArtifact).toBeTypeOf('function');
        expect(agent.createLensCardArtifact).toBeTypeOf('function');
        expect(agent.isToolAllowed).toBeTypeOf('function');
        expect(agent.runReadingAgentTask).toBeTypeOf('function');
        expect(agent.retryReadingAgentTask).toBeTypeOf('function');
        expect(agent.createTrajectoryRecorder).toBeTypeOf('function');
        expect(agent.createExperienceStore).toBeTypeOf('function');
        expect(agent.getExperienceStore).toBeTypeOf('function');
        expect(agent.resetExperienceStore).toBeTypeOf('function');
        expect(agent.summarizeTrace).toBeTypeOf('function');
        expect(agent.formatTrajectoryForPrompt).toBeTypeOf('function');
        expect(agent.exportAgentSpans).toBeTypeOf('function');
        expect(agent.serializeAgentSpans).toBeTypeOf('function');
        expect(agent.exportAgentSpansJson).toBeTypeOf('function');
        expect(agent.compressTraceForModel).toBeTypeOf('function');
        expect(agent.compressPackedContext).toBeTypeOf('function');
        expect(agent.formatToolObservation).toBeTypeOf('function');
        expect(agent.buildStatusBar).toBeTypeOf('function');
        expect(agent.runDeepReadPipeline).toBeTypeOf('function');
        expect(agent.runCriticPass).toBeTypeOf('function');
        expect(agent.scoreAgentResult).toBeTypeOf('function');
        expect(agent.runReadingEvalSuite).toBeTypeOf('function');
        expect(Array.isArray(agent.READING_EVAL_CASES)).toBe(true);
    });

    it('exports grounding, model, options, and schema modules', () => {
        expect(agent.resolveGroundingMode).toBeTypeOf('function');
        expect(agent.applyGroundingGateToResult).toBeTypeOf('function');
        expect(agent.assertGroundedFinal).toBeTypeOf('function');
        expect(Array.isArray(agent.GROUNDING_MODES)).toBe(true);

        expect(agent.resolveAgentLlmConfig).toBeTypeOf('function');
        expect(agent.createOpenAICompatibleAgentModel).toBeTypeOf('function');
        expect(agent.buildMessagesFromTrace).toBeTypeOf('function');

        expect(agent.resolveReadingAgentModel).toBeTypeOf('function');
        expect(agent.createReadingAgentOptions).toBeTypeOf('function');
        expect(agent.resolveSkillDocument).toBeTypeOf('function');
        expect(agent.resolveReadingAgentGroundingMode).toBeTypeOf('function');
        expect(agent.runDocumentQaAgent).toBeTypeOf('function');
        expect(agent.runDocumentQaFromChat).toBeTypeOf('function');
        expect(agent.isAgentDocumentQaEnabled).toBeTypeOf('function');
        expect(agent.shouldRunDocumentQaFromChat).toBeTypeOf('function');
        expect(agent.isRunnableReadingAgentType).toBeTypeOf('function');

        expect(agent.toolToOpenAIFunction).toBeTypeOf('function');
        expect(agent.TOOL_PARAMETER_SCHEMAS).toBeTypeOf('object');
    });
});
