import { Option } from "tsla-util/lib/option"
import { None } from "tsla-util/lib/option/none"
import { join } from "path"

export function maybePackageJSON(): Option<string> {
  try {
    return Option.of(require(join(process.env.PWD!, "package.json"))).map(
      e => e.name as string
    )
  } catch (e) {
    return None.none as Option<string>
  }
}
