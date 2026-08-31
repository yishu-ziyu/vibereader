import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const demoAssetsPath = resolve(process.cwd(), 'demo-assets');

function readDemoAsset(name) {
    return readFileSync(resolve(demoAssetsPath, name));
}

describe('demo assets', () => {
    it('keeps all files required by the demo script in the repository', () => {
        const requiredAssets = [
            'README.md',
            'outline-demo.pdf',
            'wonderland_short.pdf',
            'sample.md',
            'sample.txt',
            'sample.html',
            'demo-fallback-answer.md',
        ];

        for (const asset of requiredAssets) {
            const assetPath = resolve(demoAssetsPath, asset);
            expect(existsSync(assetPath), `${asset} should exist`).toBe(true);
            expect(statSync(assetPath).size, `${asset} should not be empty`).toBeGreaterThan(20);
        }
    });

    it('uses real PDF files for PDF demo paths', () => {
        expect(readDemoAsset('outline-demo.pdf').subarray(0, 4).toString()).toBe('%PDF');
        expect(readDemoAsset('wonderland_short.pdf').subarray(0, 4).toString()).toBe('%PDF');
    });
});
