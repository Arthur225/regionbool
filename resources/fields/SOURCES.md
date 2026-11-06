# Bundled field sources

**License status: unconfirmed.** The repository's owner chose to make it public on 2026-11-04 with these images included, knowing this. Resolve it before publishing installers.

All images and field sizes come from WPILib's [allwpilib](https://github.com/wpilibsuite/allwpilib) repository at commit `7eef4eb32adacfa535bad21847e8786ca81f7e9c`, in `fields/src/main/native/resources/org/wpilib/fields/frc/`.

That repository is under the WPILib BSD license, but it doesn't clearly say the images themselves are. Its `ThirdPartyNotices.txt` credits the 2024 image to MikLast on Chief Delphi, and says nothing about the others. The same images trace back to community posts on Chief Delphi, and they depict FIRST field designs.

| Image                 | Bytes   | Origin noted by Elastic or WPILib                                                   |
| --------------------- | ------- | ----------------------------------------------------------------------------------- |
| `2026-rebuilt.png`    | 784593  | Not stated                                                                          |
| `2025-reefscape.png`  | 867413  | https://www.chiefdelphi.com/t/4k-field-image-2025-reefscape/478797                  |
| `2024-crescendo.png`  | 1711040 | MikLast, https://www.chiefdelphi.com/t/2024-crescendo-top-down-field-renders/447764 |
| `2023-chargedup.png`  | 832900  | https://www.chiefdelphi.com/t/2023-top-down-field-renders/421365                    |
| `2022-rapidreact.png` | 1071256 | https://www.chiefdelphi.com/t/2022-top-down-field-renders/399031                    |

## Image orientation

All five images show red on the left, while WPILib field coordinates put blue at x = 0. So every definition sets `"image-rotated": true`, which turns the image 180° on the canvas without changing the file.

This was checked against WPILib's AprilTag positions: for example 2024's blue speaker tag at (0, 5.5) and sources at low y, and 2023's substation tags at high y. Elastic's copy of the 2024 image is the same field the right way around.

## Field sizes and symmetry

Symmetry was worked out from WPILib's AprilTag positions: for each tag, whether another tag sits at the rotated position `(L-x, W-y)` or the mirrored position `(L-x, y)`. 2023 and 2024 match mirrored for every tag, and the others match rotational for every tag.

| Field                     | Length × width (m) | Symmetry   |
| ------------------------- | ------------------ | ---------- |
| `2026-rebuilt-welded`     | 16.541 × 8.069     | rotational |
| `2026-rebuilt-andymark`   | 16.518 × 8.043     | rotational |
| `2025-reefscape-welded`   | 17.548 × 8.052     | rotational |
| `2025-reefscape-andymark` | 17.548 × 8.042     | rotational |
| `2024-crescendo`          | 16.541 × 8.211     | mirrored   |
| `2023-chargedup`          | 16.54175 × 8.0137  | mirrored   |
| `2022-rapidreact`         | 16.4592 × 8.2296   | rotational |
