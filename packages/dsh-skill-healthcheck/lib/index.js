import * as core from 'skill-healthcheck'
import { createPlugin } from './plugin.js'

const plugin = createPlugin(core)

export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
