import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function findPackageRoot() {
    let directory = path.dirname(fileURLToPath(import.meta.url));
    while (!existsSync(path.join(directory, "package.json"))) {
        const parent = path.dirname(directory);
        if (parent === directory)
            throw new Error("Could not locate Breadcrumbs package.json.");
        directory = parent;
    }
    return directory;
}
export const PACKAGE_ROOT = findPackageRoot();
export const PACKAGE_VERSION = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8")).version;
