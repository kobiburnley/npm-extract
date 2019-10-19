#!/usr/bin/env node

import * as minimist from "minimist"
import { Option } from "tsla-util/lib/option"
import { exec as nodeExec } from "child_process"
import { promisify } from "util"
import { join, basename, dirname } from "path"
import { extract } from "tar-stream"
import * as request from "request"
import { createWriteStream, promises as fs } from "fs"
import { createGunzip } from "zlib"
import { PassThrough } from "stream"
import * as nodeGlob from "glob"
import { maybePackageJSON } from "./maybePackageJSON"

const glob = promisify(nodeGlob)
const exec = promisify(nodeExec)
export interface Args {
  package?: string
  srcPattern?: string
}

export interface CompiledFile {
  pathArray: string[]
  path: string
  stream: PassThrough
}

export type Node<T> =
  | T
  | ({
      [key: string]: Node<T>
    })

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

    const response = request(tarUrl)

    const tarStream = response.pipe(createGunzip()).pipe(extract())

    tarStream.on("entry", async (header, stream, next) => {
      const { name } = header
      const pathArray = name.split("/").slice(1)

      const filePath = join(...pathArray)
      const jsBasename = basename(filePath)
      const dir = dirname(filePath)

      if (ignore.indexOf(jsBasename) === -1) {
        // setIn(dirTree, dir.split(sep), dir)
        await fs.mkdir(dir, { recursive: true })
        stream.pipe(createWriteStream(filePath))
      } else {
        stream.resume()
      }

      stream.on("end", () => {
        next()
      })
    })

    tarStream.on("finish", async () => {
      // touch a source file to make them newer than extracted files
      const { srcPattern = "src/index.ts" } = args
      // const srcFiles = await glob(srcPattern)
      const srcFiles = [srcPattern]
      const now = new Date()
      await Promise.all(srcFiles.map(srcFile => fs.utimes(srcFile, now, now)))
    })
  } catch (e) {
    console.error(e)
  }
}

main()
