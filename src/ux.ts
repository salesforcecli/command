/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// would be willing to change this, but don't want to change types on public methods (object => Record<string, undefined>))
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable no-console */
import { env } from '@salesforce/kit';
import { ensure, has, isArray, isBoolean, isString, Optional } from '@salesforce/ts-types';

/**
 * A table option configuration type that can be the TableOptions as defined by
 * [oclif/cli-ux](https://github.com/oclif/cli-ux/blob/master/src/styled/table.ts) or a string array of table keys to be used as table headers
 * for simple tables.
 *
 * @typedef {object} SfdxTableOptions
 * @property {TableOptions | string[]} options
 */
/**
 * A prompt option configuration as defined by
 * [oclif/cli-ux](https://github.com/oclif/cli-ux/blob/master/src/prompt.ts).
 *
 * @typedef {object} IPromptOptions
 * @property {string} prompt The prompt string displayed to the user.
 * @property {'normal' | 'mask' | 'hide'} type `Normal` does not hide the user input, `mask` hides the user input after the user presses `ENTER`, and `hide` hides the user input as it is being typed.
 */
/**
 * An action option configuration as defined by
 * [oclif/cli-ux](https://github.com/oclif/cli-ux/blob/master/src/action/base.ts).
 *
 * @typedef {object} OclifActionOptions
 * @property {boolean} stdout The option to display to stdout or not.
 */
import { Logger, LoggerLevel } from '@salesforce/core';
import chalk from 'chalk';
import { CliUx } from '@oclif/core';
import { Options as OclifActionOptions } from '@oclif/core/lib/cli-ux/action/base';
import { IPromptOptions } from '@oclif/core/lib/cli-ux';

/**
 * @deprecated Use Ux from `@salesforce/sf-plugins-core` instead
 * Utilities for interacting with terminal I/O.
 */
export class UX {
  /**
   * Collection of warnings that can be accessed and manipulated later.
   *
   * @type {Set<string>}
   */
  public static warnings: Set<string> = new Set<string>();

  public cli: typeof CliUx;
  private isOutputEnabled: boolean;

  /**
   * Do not directly construct instances of this class -- use {@link UX.create} instead.
   */
  public constructor(private logger: Logger, isOutputEnabled?: boolean, ux?: typeof CliUx) {
    this.cli = ux ?? CliUx;

    if (isBoolean(isOutputEnabled)) {
      this.isOutputEnabled = isOutputEnabled;
    } else {
      // Respect the --json flag and SFDX_CONTENT_TYPE for consumers who don't explicitly check
      const isContentTypeJSON = env.getString('SFDX_CONTENT_TYPE', '').toUpperCase() === 'JSON';
      this.isOutputEnabled = !(process.argv.find((arg) => arg === '--json') ?? isContentTypeJSON);
    }
  }

  /**
   * Formats a deprecation warning for display to `stderr`, `stdout`, and/or logs.
   *
   * @param {DeprecationDefinition} def The definition for the deprecated object.
   * @returns {string} The formatted deprecation message.
   */
  public static formatDeprecationWarning(def: DeprecationDefinition): string {
    let msg: string;
    if (has(def, 'version')) {
      const version = isString(def.version) ? parseInt(def.version, 10) : def.version || 0;
      // @ts-ignore
      const type = ensure(def.type);
      // @ts-ignore
      const name = ensure(def.name);
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      msg = `The ${type} "${name}" has been deprecated and will be removed in v${version + 1}.0 or later.`;
    } else {
      msg = def.messageOverride;
    }
    if (def.to) {
      msg += ` Use "${def.to}" instead.`;
    }
    if (def.message) {
      msg += ` ${def.message}`;
    }
    return msg;
  }

  /**
   * Create a `UX` instance.
   *
   * @returns {Promise<UX>} A `Promise` of the created `UX` instance.
   */
  public static async create(): Promise<UX> {
    return new UX(await Logger.child('UX'));
  }

  /**
   * Logs at `INFO` level and conditionally writes to `stdout` if stream output is enabled.
   *
   * @param {...any[]} args The messages or objects to log.
   * @returns {UX}
   */
  public log(...args: string[]): UX {
    if (this.isOutputEnabled) {
      this.cli.ux.log(...args);
    }

    // log to sfdx.log after the console as log filtering mutates the args.
    this.logger.info(...args);

    return this;
  }

  /**
   * Log JSON to stdout and to the log file with log level info.
   *
   * @param {object} obj The object to log -- must be serializable as JSON.
   * @returns {UX}
   * @throws {TypeError} If the object is not JSON-serializable.
   */
  public logJson(obj: Record<string, unknown>): UX {
    this.cli.ux.styledJSON(obj);

    // log to sfdx.log after the console as log filtering mutates the args.
    this.logger.info(obj);

    return this;
  }

  /**
   * Prompt the user for input.
   *
   * @param {string} name The string that the user sees when prompted for information.
   * @param {IPromptOptions} options A prompt option configuration.
   * @returns {Promise<string>} The user input to the prompt.
   */
  public async prompt(name: string, options: IPromptOptions = {}): Promise<string> {
    return this.cli.ux.prompt(name, options);
  }

  /**
   * Prompt the user for confirmation.
   *
   * @param {string} message The message displayed to the user.
   * @returns {Promise<boolean>} Returns `true` if the user inputs 'y' or 'yes', and `false` if the user inputs 'n' or 'no'.
   */
  public async confirm(message: string): Promise<boolean> {
    return this.cli.ux.confirm(message);
  }

  /**
   * Start a spinner action after displaying the given message.
   *
   * @param {string} message The message displayed to the user.
   * @param {string} status The status displayed to the user.
   * @param {OclifActionOptions} opts The options to select whereas spinner will output to stderr or stdout.
   */
  public startSpinner(message: string, status?: string, opts: OclifActionOptions = {}): void {
    if (this.isOutputEnabled) {
      this.cli.ux.action.start(message, status, opts);
    }
  }

  /**
   * Pause the spinner and call the given function.
   *
   * @param {function} fn The function to be called in the pause.
   * @param {string} icon The string displayed to the user.
   * @returns {T} The result returned by the passed in function.
   */
  public pauseSpinner<T>(fn: () => T, icon?: string): Optional<T> {
    if (this.isOutputEnabled) {
      return this.cli.ux.action.pause(fn, icon);
    }
  }

  /**
   * Update the spinner status.
   *
   * @param {string} status The message displayed to the user.
   */
  public setSpinnerStatus(status?: string): void {
    if (this.isOutputEnabled) {
      this.cli.ux.action.status = status;
    }
  }

  /**
   * Get the spinner status.
   *
   * @returns {Optional<string>}
   */
  public getSpinnerStatus(): Optional<string> {
    if (this.isOutputEnabled) {
      return this.cli.ux.action.status;
    }
  }

  /**
   * Stop the spinner action.
   *
   * @param {string} message The message displayed to the user.
   */
  public stopSpinner(message?: string): void {
    if (this.isOutputEnabled) {
      this.cli.ux.action.stop(message);
    }
  }

  /**
   * Logs a warning as `WARN` level and conditionally writes to `stderr` if the log
   * level is `WARN` or above and stream output is enabled.  The message is added
   * to the static {@link UX.warnings} set if stream output is _not_ enabled, for later
   * consumption and manipulation.
   *
   * @param {string} message The warning message to output.
   * @returns {UX}
   * @see UX.warnings
   */
  public warn(message: string): UX {
    const warning: string = chalk.yellow('WARNING:');

    // Necessarily log to sfdx.log.
    this.logger.warn(warning, message);

    if (this.logger.shouldLog(LoggerLevel.WARN)) {
      if (!this.isOutputEnabled) {
        UX.warnings.add(message);
      } else {
        console.warn(`${warning} ${message}`);
      }
    }

    return this;
  }

  /**
   * Logs an error at `ERROR` level and conditionally writes to `stderr` if stream
   * output is enabled.
   *
   * @param {...any[]} args The errors to log.
   * @returns {UX}
   */
  public error(...args: unknown[]): UX {
    if (this.isOutputEnabled) {
      console.error(...args);
    }

    this.logger.error(...args);

    return this;
  }

  /**
   * Logs an object as JSON at `ERROR` level and to `stderr`.
   *
   * @param {object} obj The error object to log -- must be serializable as JSON.
   * @returns {UX}
   * @throws {TypeError} If the object is not JSON-serializable.
   */
  public errorJson(obj: object): UX {
    const err = JSON.stringify(obj, null, 4);
    console.error(err);
    this.logger.error(err);
    return this;
  }

  /**
   * Logs at `INFO` level and conditionally writes to `stdout` in a table format if
   * stream output is enabled.
   *
   * @param {object[]} rows The rows of data to be output in table format.
   * @param columns Table column options
   * @param {SfdxTableOptions} options The {@link SfdxTableOptions} to use for formatting.
   * @returns {UX}
   */

  public table(
    // (allow any because matches oclif)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: any[],
    columns: TableColumns = {},
    options: CliUx.Table.table.Options = { 'no-truncate': false }
  ): UX {
    if (this.isOutputEnabled) {
      // This is either an array of column names or an already built Partial<OclifTableOptions>
      if (isArray(columns)) {
        const tableColumns: CliUx.Table.table.Columns<Record<string, unknown>> = {};
        for (const col of columns) {
          tableColumns[col] = {
            header: col
              .split(/(?=[A-Z])|[-_\s]/)
              .map((w: string) => w.toUpperCase())
              .join(' '),
          };
        }
        this.cli.ux.table(rows, tableColumns, options);
      } else {
        this.cli.ux.table(rows, columns, options);
      }
    }

    // Log after table output as log filtering mutates data.
    this.logger.info(rows);

    return this;
  }

  /**
   * Logs at `INFO` level and conditionally writes to `stdout` in a styled object format if
   * stream output is enabled.
   *
   * @param {object} obj The object to be styled for stdout.
   * @param {string[]} [keys] The object keys to be written to stdout.
   * @returns {UX}
   */
  public styledObject(obj: object, keys?: string[]): UX {
    this.logger.info(obj);
    if (this.isOutputEnabled) {
      this.cli.ux.styledObject(obj, keys);
    }
    return this;
  }

  /**
   * Log at `INFO` level and conditionally write to `stdout` in styled JSON format if
   * stream output is enabled.
   *
   * @param {object} obj The object to be styled for stdout.
   * @returns {UX}
   */
  public styledJSON(obj: object): UX {
    this.logger.info(obj);
    if (this.isOutputEnabled) {
      this.cli.ux.styledJSON(obj);
    }
    return this;
  }

  /**
   * Logs at `INFO` level and conditionally writes to `stdout` in a styled header format if
   * stream output is enabled.
   *
   * @param {string} header The header to be styled.
   * @returns {UX}
   */
  public styledHeader(header: string): UX {
    this.logger.info(header);
    if (this.isOutputEnabled) {
      this.cli.ux.styledHeader(header);
    }
    return this;
  }
}

/**
 * A table option configuration type.  May be a detailed configuration, or
 * more simply just a string array in the simple cases where table header values
 * are the only desired config option.
 */
// (allow any because matches oclif)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableColumns = CliUx.Table.table.Columns<any> | string[];

/**
 * A deprecation configuration type.  A typical instance can pass `name`,
 * `type`, and `version` for a standard message.  Alternatively, the `messageOverride` can
 * be used as a special case deprecated message.  Used when defining a deprecation on a
 * command or flag.
 */
export type Deprecation = {
  to?: string;
  message?: string;
} & (
  | {
      version: number | string;
    }
  | {
      messageOverride: string;
    }
);

/**
 *
 *  @deprecated use deprecation from oclif/core
 *
 * A deprecation warning message configuration type.  A typical instance can pass `name`,
 * `type`, and `version` for a standard message.  Alternatively, the `messageOverride` can
 * be used as a special case deprecated message.  Used when formatting a deprecation message.
 */
export type DeprecationDefinition = {
  to?: string;
  message?: string;
} & (
  | {
      version: number | string;
      name: string;
      type: string;
    }
  | {
      messageOverride: string;
    }
);
