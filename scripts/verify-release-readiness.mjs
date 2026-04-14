import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function evaluateReleaseReadiness(input) {
  const checks = [
    {
      name: 'git-user-name',
      ok: input.gitUserName === input.expectedGitUserName,
      actual: input.gitUserName || '<empty>',
      expected: input.expectedGitUserName
    },
    {
      name: 'git-user-email',
      ok: input.gitUserEmail === input.expectedGitUserEmail,
      actual: input.gitUserEmail || '<empty>',
      expected: input.expectedGitUserEmail
    },
    {
      name: 'npm-token',
      ok: input.npmTokenPresent,
      actual: input.npmTokenPresent ? 'present' : 'missing',
      expected: 'present'
    },
    {
      name: 'npm-user-name',
      ok: input.npmUserName === input.expectedNpmUserName,
      actual: input.npmUserName || '<empty>',
      expected: input.expectedNpmUserName
    }
  ];

  return {
    ok: checks.every(check => check.ok),
    checks
  };
}

async function readGitConfig(key) {
  const { stdout } = await execFileAsync('git', ['config', '--get', key], {
    cwd: process.cwd()
  });

  return stdout.trim();
}

async function readNpmUserName() {
  const { stdout } = await execFileAsync('npm', ['whoami'], {
    cwd: process.cwd(),
    env: process.env
  });

  return stdout.trim();
}

async function main() {
  const expectedGitUserName = process.env.EXPECTED_GIT_USER_NAME ?? 'betlysaas';
  const expectedGitUserEmail = process.env.EXPECTED_GIT_USER_EMAIL ?? 'betly@mx5.cn';
  const expectedNpmUserName = process.env.EXPECTED_NPM_USER_NAME ?? 'betlysaas';

  let gitUserName = '';
  let gitUserEmail = '';
  let npmUserName = '';

  try {
    gitUserName = await readGitConfig('user.name');
  } catch {}

  try {
    gitUserEmail = await readGitConfig('user.email');
  } catch {}

  try {
    npmUserName = await readNpmUserName();
  } catch {}

  const result = evaluateReleaseReadiness({
    gitUserName,
    gitUserEmail,
    npmUserName,
    npmTokenPresent: Boolean(process.env.NPM_TOKEN),
    expectedGitUserName,
    expectedGitUserEmail,
    expectedNpmUserName
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  await main();
}
