import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');

async function readRepoFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('skill package', () => {
  it('ships a public store skill with direct list/get examples', async () => {
    const skill = await readRepoFile('skills/betly-store/SKILL.md');

    expect(skill).toContain('name: betly-store');
    expect(skill).toContain('description: Use when');
    expect(skill).toContain('找岩馆');
    expect(skill).toContain('哪里攀岩');
    expect(skill).toContain('几点开门');
    expect(skill).toContain('find a climbing gym');
    expect(skill).toContain('what time does it open');
    expect(skill).toContain('先用 `store list` 缩小范围，再用 `store get` 看详情');
    expect(skill).toContain('climbing-go store list');
    expect(skill).toContain('climbing-go store get');
    expect(skill).not.toContain('climbing-go config set endpoint <url>');
    expect(skill).not.toContain('CLIMBING_MCP_ENDPOINT');
  });

  it('publishes the skill files in the npm package', async () => {
    const packageJson = JSON.parse(await readRepoFile('package.json')) as {
      files?: string[];
    };

    expect(packageJson.files).toContain('skills');
  });

  it('documents the skill entrypoint in the README', async () => {
    const readme = await readRepoFile('README.md');

    expect(readme).toContain('## Skill');
    expect(readme).toContain('skills/betly-store/SKILL.md');
    expect(readme).toContain('climbing-go store list --city 上海');
    expect(readme).toContain('已支持通过 MCP 查询公开门店列表与详情');
    expect(readme).not.toContain('config set endpoint https://mcp.example.com');
  });
});
