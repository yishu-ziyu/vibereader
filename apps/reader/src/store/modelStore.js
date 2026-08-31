import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getModelConfigs, saveModelConfigs, getSelectedConfigId, setSelectedConfigId } from '../storage';
import { isVisionCapable } from '../modelPresets';
import { normalizeModelConfigRecord, shouldDropModelConfigRecord } from '../modelConfigMigration';
import { formatCustomModelLabel } from '../i18n';

/** MiniMax Token Plan 默认配置 */
const DEFAULT_MINIMAX_CONFIG = {
  id: 'preset-minimax-default',
  baseUrl: 'https://api.minimaxi.com/anthropic',
  modelName: 'MiniMax-M3',
  apiFormat: 'anthropic',
  apiKey: '',
  providerKey: 'minimax',
  credentialMode: 'token-plan',
};

function modelSupportsVision(config) {
  if (!config?.modelName) return true;
  return isVisionCapable(config.providerKey, config.modelName);
}

function normalizeSelectedModel(selectedModel) {
  if (!selectedModel?.config) return selectedModel;
  if (shouldDropModelConfigRecord(selectedModel.config)) return null;
  const config = normalizeModelConfigRecord(selectedModel.config);
  return {
    ...selectedModel,
    label: formatCustomModelLabel(config.modelName || config.name),
    configId: selectedModel.configId || config.id,
    config,
  };
}

function resolveInitialModel() {
  try {
    let configs = getModelConfigs();
    // 首次使用：只创建我们真实用于开发验证的 MiniMax M3 配置模板。
    // Kimi 没有本机 Key 时不能作为默认或测试链路。
    if (!Array.isArray(configs) || configs.length === 0) {
      configs = [
        { ...DEFAULT_MINIMAX_CONFIG }
      ];
      saveModelConfigs(configs);
      setSelectedConfigId(DEFAULT_MINIMAX_CONFIG.id);
      return {
        key: 'custom',
        label: formatCustomModelLabel(DEFAULT_MINIMAX_CONFIG.modelName),
        configId: DEFAULT_MINIMAX_CONFIG.id,
        config: DEFAULT_MINIMAX_CONFIG,
      };
    }
    const selectedId = getSelectedConfigId();
    const cfg = selectedId
      ? (configs.find((c) => c.id === selectedId) || configs[0])
      : configs[0];
    if (cfg) {
      if (selectedId && cfg.id !== selectedId) {
        setSelectedConfigId(cfg.id);
      }
      return {
        key: 'custom',
        label: formatCustomModelLabel(cfg.modelName || cfg.name),
        configId: cfg.id,
        config: {
          ...cfg,
          baseUrl: cfg.baseUrl || cfg.baseURL || '',
        },
      };
    }
  } catch (_) {
    /* ignore */
  }
  return {
    key: 'custom',
    label: 'Custom Model',
    configId: null,
    config: null,
  };
}

function resolveInitialVisionCapable() {
  const initialModel = resolveInitialModel();
  return modelSupportsVision(initialModel?.config);
}

export const useModelStore = create(
  persist(
    (set, get) => ({
      // State
      selectedModel: resolveInitialModel(),
      modelConfigs: [],
      selectedConfigId: null,
      visionCapable: resolveInitialVisionCapable(),

      // Actions - setters
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      setModelConfigs: (modelConfigs) => set({ modelConfigs }),
      setSelectedConfigId: (selectedConfigId) => set({ selectedConfigId }),
      setVisionCapable: (visionCapable) => set({ visionCapable }),

      // Actions - computed / helpers
      selectModel: (model) => {
        const selectedModel = normalizeSelectedModel(model);
        const visionCapable = modelSupportsVision(selectedModel?.config);
        set({ selectedModel, visionCapable });
      },

      getCurrentModelName: () => {
        return get().selectedModel?.config?.modelName || '';
      },

      getCurrentModelLabel: () => {
        return get().selectedModel?.label || 'Custom Model';
      },

      isCurrentModelVisionCapable: () => {
        return modelSupportsVision(get().selectedModel?.config);
      },

      hasValidConfig: () => {
        return !!get().selectedModel?.config;
      },
    }),
    {
      name: 'ai-chat-model-store',
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        selectedConfigId: state.selectedConfigId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState && typeof persistedState === 'object'
          ? persistedState
          : {};
        const selectedModel = normalizeSelectedModel(persisted.selectedModel) || currentState.selectedModel;
        return {
          ...currentState,
          ...persisted,
          selectedModel,
          selectedConfigId: persisted.selectedConfigId || selectedModel?.configId || currentState.selectedConfigId,
          visionCapable: modelSupportsVision(selectedModel?.config),
        };
      },
    }
  )
);
