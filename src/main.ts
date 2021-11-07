import axios from 'axios'
import { exec } from 'child_process'
import config from 'config'
import fs from 'fs'
import path from 'path'
import { GitHubReleaseRoot } from './models/release'

class Release {
  constructor(
    public id: number,
    public name: string,
    // eslint-disable-next-line camelcase
    public published_at: Date,
    // eslint-disable-next-line camelcase
    public html_url: string,
    // eslint-disable-next-line camelcase
    public browser_download_url: string
  ) {
    this.id = id
    // eslint-disable-next-line camelcase
    this.published_at = published_at
    // eslint-disable-next-line camelcase
    this.html_url = html_url
    // eslint-disable-next-line camelcase
    this.browser_download_url = browser_download_url
  }
}
async function getLatestRelease(repo: string): Promise<Release | null> {
  const response = await axios.get<GitHubReleaseRoot[]>(
    `https://api.github.com/repos/jaoafa/${repo}/releases?per_page=1`
  )
  const latest = response.data[0]
  if (latest == null) {
    return null
  }
  if (latest.assets.length === 0) {
    return null
  }
  return new Release(
    latest.id,
    latest.name,
    new Date(latest.published_at),
    latest.html_url,
    latest.assets[0].browser_download_url
  )
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  console.log(`Downloading ${url} to ${dest}`)
  const response = await axios.get(url, {
    responseType: 'stream',
  })
  response.data.pipe(fs.createWriteStream(dest))
  return new Promise<boolean>((resolve, reject) => {
    response.data.on('end', () => {
      console.log('Downloaded.')
      resolve(true)
    })
    response.data.on('error', (err: any) => {
      console.error(err)
      reject(err)
    })
  })
}

async function runCommand(command: string, cwd = '.') {
  return new Promise<string>((resolve, reject) => {
    exec(
      command,
      {
        cwd,
      },
      (err: any, stdout: string) => {
        if (err) {
          reject(err)
        }
        resolve(stdout)
      }
    )
  })
}
async function sendMessageForDiscord(
  content: string,
  embed: { [key: string]: any }
) {
  const channelId = config.get('discordChannelId') as string
  const token = config.get('discordToken') as string
  await axios.post(
    `https://discord.com/api/channels/${channelId}/messages`,
    {
      content,
      embed,
    },
    {
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )
}

async function main(_dest: string) {
  const dest = path.resolve(_dest)
  const jaowebLatest = await getLatestRelease('jaoweb')
  const docsLatest = await getLatestRelease('jaoweb-docs')
  const latest =
    jaowebLatest != null && docsLatest != null
      ? jaowebLatest.published_at > docsLatest.published_at
        ? jaowebLatest
        : docsLatest
      : jaowebLatest != null
      ? jaowebLatest
      : docsLatest
  const latestType =
    jaowebLatest === latest ? 'jaoweb' : docsLatest === latest ? 'docs' : 'NULL'
  if (latest == null) {
    console.log('No release found.')
    return
  }
  console.log(`Latest release: ${latest.id}`)
  console.log(`Published at: ${latest.published_at}`)
  console.log(`Download URL: ${latest.browser_download_url}`)

  const current = fs.existsSync('./current')
    ? fs.readFileSync('./current', 'utf8')
    : null
  if (current === latest.id.toString()) {
    console.log('Already up to date.')
    return
  }

  if (fs.existsSync('./dist.tgz')) {
    fs.unlinkSync('./dist.tgz')
  }
  await downloadFile(latest.browser_download_url, './dist.tgz')

  if (fs.existsSync('./dist')) {
    fs.rmSync('./dist', { recursive: true })
  }
  fs.mkdirSync('./dist', { recursive: true })

  await runCommand('tar xvf dist.tgz -C dist')
  if (fs.existsSync('./dist.tgz')) {
    fs.unlinkSync('./dist.tgz')
  }

  await runCommand(`rm -rf $(ls -A)`, dest)
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  await runCommand(`cp -r $(ls -A) ${dest}`, './dist')

  sendMessageForDiscord('', {
    title: '`jaoafa.com` へのデプロイが完了',
    description: `${latest.name} in ${latestType} (${latest.published_at})`,
    url: `${latest.html_url}`,
    color: 0x00ff00,
  })

  fs.writeFileSync('./current', latest.id.toString())
}

;(async () => {
  try {
    await main(config.get('destDirectory'))
  } catch (error) {
    sendMessageForDiscord('', {
      title: '`jaoafa.com` へのデプロイが失敗',
      color: 0xff0000,
    })
  }
})()
