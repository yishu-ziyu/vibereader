import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildParagraphId,
    expandTreeToParagraph,
    findParagraphElements,
    parseParagraphId,
    pulseHighlightParagraph,
    scrollTreeToNode,
} from './bidirectionalAnchor';

describe('bidirectionalAnchor', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('builds stable paragraph ids from one-based pages and zero-based indexes', () => {
        expect(buildParagraphId(3, 2)).toBe('page-3-para-2');
        expect(buildParagraphId(1, 0)).toBe('page-1-para-0');
    });

    it('returns null instead of building ids from invalid coordinates', () => {
        expect(buildParagraphId(0, 1)).toBeNull();
        expect(buildParagraphId(1, -1)).toBeNull();
        expect(buildParagraphId(1.5, 0)).toBeNull();
        expect(buildParagraphId('1', 0)).toBeNull();
    });

    it('parses stable paragraph ids into page and paragraph index', () => {
        expect(parseParagraphId('page-12-para-4')).toEqual({ page: 12, index: 4 });
        expect(parseParagraphId('page-1-para-0')).toEqual({ page: 1, index: 0 });
    });

    it('returns a null location object for malformed paragraph ids', () => {
        expect(parseParagraphId('page-0-para-1')).toEqual({ page: null, index: null });
        expect(parseParagraphId('page-1-para--1')).toEqual({ page: null, index: null });
        expect(parseParagraphId('p-1-0')).toEqual({ page: null, index: null });
        expect(parseParagraphId(null)).toEqual({ page: null, index: null });
    });

    it('finds every text-layer element that belongs to a paragraph id', () => {
        document.body.innerHTML = `
            <div class="textLayer">
                <span id="first" data-paragraph-id="page-3-para-2">A</span>
                <span id="second" data-paragraph-id="page-3-para-2">B</span>
                <span id="other" data-paragraph-id="page-3-para-20">C</span>
            </div>
        `;

        const elements = findParagraphElements('page-3-para-2');

        expect([...elements].map((element) => element.id)).toEqual(['first', 'second']);
    });

    it('returns an empty collection when paragraph lookup input is invalid', () => {
        document.body.innerHTML = '<span data-paragraph-id="page-1-para-0">A</span>';

        expect([...findParagraphElements('page-1')]).toEqual([]);
        expect([...findParagraphElements(undefined)]).toEqual([]);
    });

    it('adds and removes the pulse highlight class on matching paragraph elements', () => {
        vi.useFakeTimers();
        document.body.innerHTML = `
            <span id="first" data-paragraph-id="page-2-para-1">A</span>
            <span id="second" data-paragraph-id="page-2-para-1">B</span>
        `;

        const count = pulseHighlightParagraph('page-2-para-1', { duration: 500, pulses: 2 });
        const elements = [...findParagraphElements('page-2-para-1')];

        expect(count).toBe(2);
        expect(elements.every((element) => element.classList.contains('pulse-highlight-active'))).toBe(true);
        expect(elements.every((element) => element.dataset.anchorPulse === 'true')).toBe(true);

        vi.advanceTimersByTime(500);

        expect(elements.every((element) => element.classList.contains('pulse-highlight-active'))).toBe(false);
        expect(elements.every((element) => element.dataset.anchorPulse === undefined)).toBe(true);
    });

    it('does not pulse highlight when no paragraph elements are found', () => {
        vi.useFakeTimers();

        expect(pulseHighlightParagraph('page-9-para-9', { duration: 500 })).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('scrolls a matching tree node into view and marks it as anchor-active', () => {
        document.body.innerHTML = `
            <div id="tree">
                <button data-tree-paragraph-id="page-4-para-1">Target</button>
            </div>
        `;
        const treeContainer = document.getElementById('tree');
        const target = treeContainer.querySelector('[data-tree-paragraph-id]');
        target.scrollIntoView = vi.fn();

        const result = scrollTreeToNode('page-4-para-1', treeContainer);

        expect(result).toBe(target);
        expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
        expect(target.classList.contains('bidirectional-anchor-active')).toBe(true);
        expect(target.dataset.anchorActive).toBe('true');
    });

    it('clears the prior tree anchor marker before marking the next node', () => {
        document.body.innerHTML = `
            <div id="tree">
                <button id="old" class="bidirectional-anchor-active" data-anchor-active="true" data-tree-paragraph-id="page-1-para-0">Old</button>
                <button id="next" data-paragraph-id="page-1-para-1">Next</button>
            </div>
        `;
        const treeContainer = document.getElementById('tree');
        const oldNode = document.getElementById('old');
        const nextNode = document.getElementById('next');
        nextNode.scrollIntoView = vi.fn();

        scrollTreeToNode('page-1-para-1', treeContainer);

        expect(oldNode.classList.contains('bidirectional-anchor-active')).toBe(false);
        expect(oldNode.dataset.anchorActive).toBeUndefined();
        expect(nextNode.classList.contains('bidirectional-anchor-active')).toBe(true);
    });

    it('returns null when tree scrolling input is invalid or unmatched', () => {
        const treeContainer = document.createElement('div');

        expect(scrollTreeToNode('bad-id', treeContainer)).toBeNull();
        expect(scrollTreeToNode('page-1-para-0', null)).toBeNull();
        expect(scrollTreeToNode('page-1-para-0', treeContainer)).toBeNull();
    });

    it('expands every ancestor node needed to reveal a paragraph', () => {
        const sections = [
            {
                id: 'root',
                children: [
                    {
                        id: 'section-a',
                        children: [
                            {
                                id: 'subsection-a',
                                paragraphs: [
                                    { id: 'paragraph-a', paragraphId: 'page-5-para-3' },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];
        const setExpandedIds = vi.fn();

        const expandedPath = expandTreeToParagraph('page-5-para-3', setExpandedIds, sections);
        const updater = setExpandedIds.mock.calls[0][0];

        expect(expandedPath).toEqual(['root', 'section-a', 'subsection-a']);
        expect(updater(['existing', 'section-a'])).toEqual([
            'existing',
            'section-a',
            'root',
            'subsection-a',
        ]);
    });

    it('does not expand the tree when no matching paragraph exists', () => {
        const setExpandedIds = vi.fn();

        expect(expandTreeToParagraph('page-8-para-1', setExpandedIds, [{ id: 'section-a' }])).toEqual([]);
        expect(setExpandedIds).not.toHaveBeenCalled();
    });
});
