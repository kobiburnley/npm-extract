#!/usr/bin/env node

import { exec as nodeExec } from "child_process"
import { createWriteStream, promises as fs } from "fs"
import * as minimist from "minimist"
import * as pEvent from "p-event"
import { basename, dirname, join } from "path"
import * as request from "request"
import { extract } from "tar-stream"
import { Option } from "tsla-util/lib/option"
import { promisify } from "util"
import { createGunzip } from "zlib"
import { maybePackageJSON } from "./maybePackageJSON"

const exec = promisify(nodeExec)
export interface Args {
  package?: string
  srcPattern?: string
}

async function main() {
  const ignore = ["package.json", "README.md", "CHANGELOG.md"]
  try {
    const args = minimist(process.argv.slice(2)) as Partial<Args>
    const packageNameOption = Option.of(args.package).orElse(maybePackageJSON)

    if (packageNameOption.isNone()) {
      throw new Error("Invalid package name")
    }

    const packageName = packageNameOption.value

    const { stdout: tarUrl } = await exec(
      `npm view ${packageName} dist.tarball`
    )

    const tarStream = request(tarUrl)
      .pipe(createGunzip())
      .pipe(extract())

    const asyncIterator = pEvent.iterator(tarStream, "entry", {
      multiArgs: true,
      resolutionEvents: ["finish"]
    })

    for await (const [header, stream, next] of asyncIterator) {
      const { name } = header
      const pathArray = name.split("/").slice(1)

      const filePath = join(...pathArray)
      const jsBasename = basename(filePath)
      const dir = dirname(filePath)

      if (ignore.indexOf(jsBasename) === -1) {
        await fs.mkdir(dir, { recursive: true })
        stream.pipe(createWriteStream(filePath))
      } else {
        stream.resume()
      }

      await pEvent(stream, "end")
      next()
    }

    // touch a source file to make them newer than extracted files
    const { srcPattern = "src/index.ts" } = args
    const srcFiles = [srcPattern]
    const now = new Date()
    await Promise.all(srcFiles.map(srcFile => fs.utimes(srcFile, now, now)))
  } catch (e) {
    console.error(e)
  }
}

main()
