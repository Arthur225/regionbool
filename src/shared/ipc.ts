/**
 * The complete IPC contract between the main process and the renderer.
 *
 * Every channel is declared here so both sides share one definition, and so this
 * file lists everything the sandboxed renderer is able to ask for.
 *
 * The renderer never sends file paths or file contents. The main process picks the project through
 * a native dialog, remembers it, and generates code itself, so a compromised renderer can only
 * write generated Java to the project the user chose.
 */
import type { FieldDefinition } from './fields';
import type { JavaProfileId } from './javaProfiles';
import type { FieldSymmetry, RegionProject, ValidationIssue } from './model';

/** Names of all IPC channels. */
export const IpcChannel = {
  /** Returns {@link AppInfo}. Takes no arguments and has no side effects. */
  GetAppInfo: 'app:get-info',
  /** Shows a folder picker and makes the chosen folder the current project. Returns {@link OpenProjectResult}. */
  OpenProject: 'project:open',
  /** Forgets the current project. Nothing on disk changes. */
  CloseProject: 'project:close',
  /** Takes project data and saves it to `.regionbool/regions.json`. Returns {@link SaveResult}. */
  SaveRegions: 'project:save',
  /** Returns the current {@link ProjectInfo}, or null if none is open. */
  GetCurrentProject: 'project:get-current',
  /** Takes project data and a profile id. Generates code without writing it. Returns {@link ExportPreviewResult}. */
  PreviewExport: 'export:preview',
  /** Takes project data, a profile id and the preview's hash. Returns {@link ExportWriteResult}. */
  WriteExport: 'export:write',
  /** Returns the {@link FieldDefinition} list for the bundled and current project's fields. */
  ListFields: 'fields:list',
  /** Takes a field id. Returns the image as a data URL, or null if unavailable. */
  GetFieldImage: 'fields:get-image',
  /** Shows a file picker for an image, and remembers the file. Returns {@link PickImageResult}. */
  PickFieldImage: 'fields:pick-image',
  /** Takes a {@link CustomFieldSpec}. Copies the picked image into the project. Returns {@link SaveCustomFieldResult}. */
  SaveCustomField: 'fields:save-custom',
} as const;

/** Basic facts about the running app, used by the UI and to confirm the IPC bridge works. */
export interface AppInfo {
  /** App version from package.json, such as `0.1.0`. */
  version: string;
  /** Electron runtime version. */
  electronVersion: string;
}

/** How the WPILib API generation of a project was determined. */
export interface ProfileDetection {
  /** The best guess, or null when nothing indicates one. */
  id: JavaProfileId | null;
  /**
   * - `imports`: from the project's Java imports, the most direct evidence.
   * - `gradle`: from the GradleRIO plugin and version.
   * - `none`: no evidence was found.
   */
  source: 'imports' | 'gradle' | 'none';
  /** False when the evidence is mixed or weak, so the UI should ask the user to confirm. */
  confident: boolean;
  /** Number of `import edu.wpi.first...` lines found. */
  legacyImports: number;
  /** Number of `import org.wpilib...` lines found. */
  modernImports: number;
}

/** What was found in a valid WPILib Java project. */
export interface ProjectInfo {
  /** Absolute path of the project folder. */
  root: string;
  /** The folder's name. */
  name: string;
  /** GradleRIO plugin id, such as `edu.wpi.first.GradleRIO`, or null if it couldn't be read. */
  gradleRioPlugin: string | null;
  /** GradleRIO version, such as `2026.1.1`, or null if it couldn't be read. */
  gradleRioVersion: string | null;
  /** `projectYear` from the WPILib preferences, such as `2026`, or null if missing. */
  projectYear: string | null;
  /** Team number from the WPILib preferences, or null if missing. */
  teamNumber: number | null;
  profile: ProfileDetection;
  /** Suggested package for generated code, based on the robot's main class. */
  defaultPackageName: string;
}

/** What was found in a project's `.regionbool/regions.json`. */
export type SavedRegions =
  | { status: 'none' }
  | { status: 'loaded'; project: RegionProject }
  /** The file exists but can't be used. The app refuses to save over it. */
  | { status: 'invalid'; message: string };

/** The result of saving region data. */
export type SaveResult = { ok: true } | { ok: false; message: string };

/** The result of asking the user to pick a project. */
export type OpenProjectResult =
  | { status: 'opened'; project: ProjectInfo; saved: SavedRegions }
  | { status: 'canceled' }
  /** The folder isn't a WPILib Java project. The current project stays open. */
  | { status: 'invalid'; path: string; reasons: string[] };

/** How an export would affect the file on disk. */
export type ExportFileStatus =
  /** No file there yet. */
  | 'new'
  /** The same as what would be written, ignoring comments and formatting. */
  | 'unchanged'
  /** A previously generated file that would be replaced. */
  | 'update'
  /** A file without the RegionBool header. The app refuses to overwrite it. */
  | 'not-generated';

/** Shown to the user before anything is written. */
export type ExportPreviewResult =
  | {
      ok: true;
      /** Target path relative to the project root, with forward slashes. */
      relativePath: string;
      status: ExportFileStatus;
      /** Current file contents, or null if there's no file. */
      existing: string | null;
      /** What would be written. */
      generated: string;
      /**
       * True if the code was changed since the last export, so writing would lose those edits.
       * Reformatting doesn't count, because tools such as Spotless often run on generated files.
       * Only known when `regions.json` recorded a hash for that export.
       */
      handEdited: boolean;
      /** Hash of the current file, passed back to confirm it hasn't changed. Null if no file. */
      existingHash: string | null;
    }
  | { ok: false; message: string; issues: ValidationIssue[] };

/** The result of writing generated code. */
export type ExportWriteResult =
  | { ok: true; relativePath: string; hash: string }
  | { ok: false; message: string; issues: ValidationIssue[] };

/** The result of asking the user to pick a field image. */
export type PickImageResult =
  | { status: 'picked'; fileName: string; dataUrl: string }
  | { status: 'canceled' }
  | { status: 'invalid'; message: string };

/** What the user entered about an imported image. Pixel positions are in the image's own pixels. */
export interface CustomFieldSpec {
  name: string;
  lengthMeters: number;
  widthMeters: number;
  symmetry: FieldSymmetry;
  /** True if the image shows red on the left. */
  imageRotated: boolean;
  topLeftPixel: [number, number];
  bottomRightPixel: [number, number];
}

/** The result of importing a field image. */
export type SaveCustomFieldResult =
  { ok: true; field: FieldDefinition } | { ok: false; message: string };

/** The API the preload script exposes to the renderer as `window.regionbool`. */
export interface RegionBoolApi {
  getAppInfo(): Promise<AppInfo>;
  openProject(): Promise<OpenProjectResult>;
  closeProject(): Promise<void>;
  /** `project` is checked against the file schema by the main process. */
  saveRegions(project: unknown): Promise<SaveResult>;
  getCurrentProject(): Promise<ProjectInfo | null>;
  /** `project` is checked against the file schema by the main process, so it's typed as unknown. */
  previewExport(project: unknown, profileId: JavaProfileId): Promise<ExportPreviewResult>;
  /** `expectedHash` is `existingHash` from the preview the user approved. */
  writeExport(
    project: unknown,
    profileId: JavaProfileId,
    expectedHash: string | null,
  ): Promise<ExportWriteResult>;
  listFields(): Promise<FieldDefinition[]>;
  getFieldImage(fieldId: string): Promise<string | null>;
  pickFieldImage(): Promise<PickImageResult>;
  /** Imports the most recently picked image. The renderer never names a file. */
  saveCustomField(spec: CustomFieldSpec): Promise<SaveCustomFieldResult>;
}
