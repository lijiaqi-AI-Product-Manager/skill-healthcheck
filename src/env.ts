import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

// Every path the tool touches is derived from these, so tests and the demo can run in a sandbox.

export function userHome(): string {
  return resolve(process.env.SKILL_HEALTHCHECK_USER_HOME || homedir())
}

export function dshHome(): string {
  return resolve(process.env.DSH_HOME || join(userHome(), '.dsh'))
}

export function agentsHome(): string {
  return resolve(process.env.DSH_AGENTS_HOME || join(userHome(), '.agents'))
}

export function dataHome(): string {
  return resolve(process.env.SKILL_HEALTHCHECK_HOME || join(userHome(), '.skill-healthcheck'))
}

export function nowMs(): number {
  const fixed = process.env.SKILL_HEALTHCHECK_NOW
  return fixed ? Date.parse(fixed) : Date.now()
}
