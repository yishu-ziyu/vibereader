import { create } from 'zustand';
import { parseVibe } from '../vibeParser';

export const useVibeStore = create((set, get) => ({
  // ─── State ─────────────────────────────────────────────────────────────────

  vibeData: null,
  parsing: false,
  selectedSectionId: null,
  parseError: null,

  // ─── Actions - Setters ─────────────────────────────────────────────────────

  setVibeData: (vibeData) => set({ vibeData }),
  setParsing: (parsing) => set({ parsing }),
  setSelectedSectionId: (selectedSectionId) => set({ selectedSectionId }),
  setParseError: (parseError) => set({ parseError }),

  // ─── Actions - Computed / Helpers ──────────────────────────────────────────

  /**
   * Parse raw PDF text and store the structured VIBE representation.
   * @param {string} text - Raw PDF text with page markers
   */
  parsePdfText: (text) => {
    set({ parsing: true, parseError: null });

    try {
      const result = parseVibe(text);
      set({
        vibeData: result,
        parsing: false,
        selectedSectionId: result.sections[0]?.id || null,
      });
    } catch (error) {
      set({
        parsing: false,
        parseError: error.message || 'Failed to parse PDF text',
      });
    }
  },

  /**
   * Select a section by its ID.
   * @param {string} id - Section ID
   */
  setSelectedSection: (id) => {
    set({ selectedSectionId: id });
  },

  /**
   * Clear all VIBE data and reset state.
   */
  clearVibeData: () =>
    set({
      vibeData: null,
      parsing: false,
      selectedSectionId: null,
      parseError: null,
    }),

  /**
   * Get the currently selected section object.
   * @returns {object|null}
   */
  getSelectedSection: () => {
    const { vibeData, selectedSectionId } = get();
    if (!vibeData || !selectedSectionId) return null;
    return vibeData.sections.find((s) => s.id === selectedSectionId) || null;
  },

  /**
   * Get a section by its ID.
   * @param {string} id - Section ID
   * @returns {object|null}
   */
  getSectionById: (id) => {
    const { vibeData } = get();
    if (!vibeData) return null;
    return vibeData.sections.find((s) => s.id === id) || null;
  },

  /**
   * Get all entities of a specific type across the paper.
   * @param {string} type - Entity type: 'figure' | 'table' | 'equation' | 'code'
   * @returns {Array}
   */
  getEntitiesByType: (type) => {
    const { vibeData } = get();
    if (!vibeData) return [];

    const globalEntities = vibeData[`${type}s`] || [];
    const sectionEntities = vibeData.sections.flatMap(
      (s) => s.entities?.filter((e) => e.type === type) || []
    );

    // Deduplicate by label
    const seen = new Set();
    return [...globalEntities, ...sectionEntities].filter((e) => {
      if (seen.has(e.label)) return false;
      seen.add(e.label);
      return true;
    });
  },

  /**
   * Get a summary of the parsed paper.
   * @returns {object|null}
   */
  getVibeSummary: () => {
    const { vibeData } = get();
    if (!vibeData) return null;

    return {
      title: vibeData.title,
      hasAbstract: !!vibeData.abstract,
      sectionCount: vibeData.sections.length,
      figureCount: vibeData.figures.length,
      tableCount: vibeData.tables.length,
      equationCount: vibeData.equations.length,
      keywordCount: vibeData.keywords.length,
      referenceCount: vibeData.references.length,
    };
  },

  /**
   * Check if VIBE data is available.
   * @returns {boolean}
   */
  hasVibeData: () => {
    return !!get().vibeData;
  },
}));
