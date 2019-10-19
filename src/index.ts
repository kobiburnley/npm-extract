#!/usr/bin/env node

import * as minimist from "minimist"
import { Option } from "tsla-util/lib/option"
import { None } from "tsla-util/lib/option/none"
import { exec as nodeExec } from "child_process"
import { promisify } from "util"
import { join, basename, dirname } from "path"
import { extract } from "tar-stream"
import * as request from "request"
import { createWriteStream, promises as fs } from "fs"
import { createGunzip } from "zlib"

const exec = promisify(nodeExec)

export interface Args {
  package?: string
}

export function maybePackageJSON(): Option<string> {
  try {
    return Option.of(require(join(process.env.PWD!, "package.json"))).map(
      e => e.name as string
    )
  } catch (e) {
    return None.none as Option<string>
  }
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

    const response = request(tarUrl)
 
    const tarStream = response.pipe(createGunzip()).pipe(extract())

    tarStream.on("entry", async (header, stream, next) => {
      const { name } = header
      const pathArray = name.split("/").slice(1)
      const file = join(...pathArray)

      if (ignore.indexOf(basename(file)) === -1) {
        await fs.mkdir(dirname(file), { recursive: true })
        stream.pipe(createWriteStream(file))
      }
      next()
    })
  } catch (e) {
    console.error(e)
  }
}

main()

console.log("change")
