import { Netrc } from 'netrc-parser'
import { getAppNumber, isTestInstance } from '../helpers/core-utils'
import { join } from 'path'
import { getVideoChannel, root } from '../../shared/extra-utils'
import { Command } from 'commander'
import { VideoChannel, VideoPrivacy } from '../../shared/models/videos'

let configName = 'PeerTube/CLI'
if (isTestInstance()) configName += `-${getAppNumber()}`

const config = require('application-config')(configName)

const version = require('../../../package.json').version

interface Settings {
  remotes: any[],
  default: number
}

function getSettings () {
  return new Promise<Settings>((res, rej) => {
    const defaultSettings = {
      remotes: [],
      default: -1
    }

    config.read((err, data) => {
      if (err) return rej(err)

      return res(Object.keys(data).length === 0 ? defaultSettings : data)
    })
  })
}

async function getNetrc () {
  const Netrc = require('netrc-parser').Netrc

  const netrc = isTestInstance()
    ? new Netrc(join(root(), 'test' + getAppNumber(), 'netrc'))
    : new Netrc()

  await netrc.load()

  return netrc
}

function writeSettings (settings) {
  return new Promise((res, rej) => {
    config.write(settings, err => {
      if (err) return rej(err)

      return res()
    })
  })
}

function deleteSettings () {
  return new Promise((res, rej) => {
    config.trash((err) => {
      if (err) return rej(err)

      return res()
    })
  })
}

function getRemoteObjectOrDie (program: any, settings: Settings, netrc: Netrc) {
  if (!program['url'] || !program['username'] || !program['password']) {
    // No remote and we don't have program parameters: quit
    if (settings.remotes.length === 0 || Object.keys(netrc.machines).length === 0) {
      if (!program[ 'url' ]) console.error('--url field is required.')
      if (!program[ 'username' ]) console.error('--username field is required.')
      if (!program[ 'password' ]) console.error('--password field is required.')

      return process.exit(-1)
    }

    let url: string = program['url']
    let username: string = program['username']
    let password: string = program['password']

    if (!url && settings.default !== -1) url = settings.remotes[settings.default]

    const machine = netrc.machines[url]

    if (!username && machine) username = machine.login
    if (!password && machine) password = machine.password

    return { url, username, password }
  }

  return {
    url: program[ 'url' ],
    username: program[ 'username' ],
    password: program[ 'password' ]
  }
}

function buildCommonVideoOptions (command: Command) {
  function list (val) {
    return val.split(',')
  }

  return command
    .option('-n, --video-name <name>', 'Video name')
    .option('-c, --category <category_number>', 'Category number')
    .option('-l, --licence <licence_number>', 'Licence number')
    .option('-L, --language <language_code>', 'Language ISO 639 code (fr or en...)')
    .option('-t, --tags <tags>', 'Video tags', list)
    .option('-N, --nsfw', 'Video is Not Safe For Work')
    .option('-d, --video-description <description>', 'Video description')
    .option('-P, --privacy <privacy_number>', 'Privacy')
    .option('-C, --channel-name <channel_name>', 'Channel name')
    .option('-m, --comments-enabled', 'Enable comments')
    .option('-s, --support <support>', 'Video support text')
    .option('-w, --wait-transcoding', 'Wait transcoding before publishing the video')
}

async function buildVideoAttributesFromCommander (url: string, command: Command, defaultAttributes: any) {
  const booleanAttributes: { [id: string]: boolean } = {}

  for (const key of [ 'nsfw', 'commentsEnabled', 'downloadEnabled', 'waitTranscoding' ]) {
    if (command[ key ] !== undefined) {
      booleanAttributes[key] = command[ key ]
    } else if (defaultAttributes[key] !== undefined) {
      booleanAttributes[key] = defaultAttributes[key]
    } else {
      booleanAttributes[key] = false
    }
  }

  const videoAttributes = {
    name: command[ 'videoName' ] || defaultAttributes.name,
    category: command[ 'category' ] || defaultAttributes.category || undefined,
    licence: command[ 'licence' ] || defaultAttributes.licence || undefined,
    language: command[ 'language' ] || defaultAttributes.language || undefined,
    privacy: command[ 'privacy' ] || defaultAttributes.privacy || VideoPrivacy.PUBLIC,
    support: command[ 'support' ] || defaultAttributes.support || undefined
  }

  Object.assign(videoAttributes, booleanAttributes)

  if (command[ 'channelName' ]) {
    const res = await getVideoChannel(url, command['channelName'])
    const videoChannel: VideoChannel = res.body

    Object.assign(videoAttributes, { channelId: videoChannel.id })

    if (!videoAttributes.support && videoChannel.support) {
      Object.assign(videoAttributes, { support: videoChannel.support })
    }
  }

  return videoAttributes
}

// ---------------------------------------------------------------------------

export {
  version,
  config,
  getSettings,
  getNetrc,
  getRemoteObjectOrDie,
  writeSettings,
  deleteSettings,

  buildCommonVideoOptions,
  buildVideoAttributesFromCommander
}
