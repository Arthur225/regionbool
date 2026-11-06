# 0016: Use the MIT license

**Status:** accepted

## Decision

RegionBool is under the MIT license, with the owner as copyright holder. Two exceptions are stated in `LICENSE`: `resources/fields` isn't covered, and Java code generated into a user's project belongs to that user, with no notice required.

## Why

The owner wants anyone to be able to do what they want with it, as long as they credit it, which is what MIT asks. The field images aren't this project's work, so it can't license them. Requiring a notice in every robot project that uses generated code would add friction without helping anyone.

## Consequences

The license has to travel with copies, so `electron-builder.yml` includes `LICENSE` in the package. `package.json` uses `SEE LICENSE IN LICENSE` because of the exceptions.
