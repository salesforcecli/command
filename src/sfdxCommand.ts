/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Command } from '@oclif/core';
import {
  Global,
  Lifecycle,
  Logger,
  Messages,
  Mode,
  Org,
  SfdxConfigAggregator,
  SfError,
  SfProject,
} from '@salesforce/core';
import { env } from '@salesforce/kit';
import { AnyJson, Dictionary, get, has, isBoolean, JsonMap, Optional } from '@salesforce/ts-types';
import chalk from 'chalk';
import { OutputArgs, OutputFlags } from '@oclif/core/lib/interfaces';
import { DocOpts } from './docOpts';
import { buildSfdxFlags, flags as Flags, FlagsConfig } from './sfdxFlags';
import { Deprecation, DeprecationDefinition, TableColumns, UX } from './ux';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.load('@salesforce/command', 'command', [
  'error.RequiresProject',
  'error.RequiresUsername',
  'warning.ApiVersionOverride',
  'error.InvalidVarargsFormat',
  'error.DuplicateVarargs',
  'error.VarargsRequired',
  'error.RequiresDevhubUsername',
]);

export interface SfdxResult {
  data?: AnyJson;
  tableColumnData?: TableColumns;
  display?: (this: Result) => void;
}

/**
 * A class that handles command results and formatting.  Use this class
 * to override command display behavior or to get complex table formatting.
 * For simple table formatting, use {@link SfdxCommand.tableColumnData} to
 * define a string array of keys to use as table columns.
 */
export class Result implements SfdxResult {
  public data!: AnyJson; // assigned in SfdxCommand._run
  public tableColumnData?: TableColumns;
  public ux!: UX; // assigned in SfdxCommand.init

  public constructor(config: SfdxResult = {}) {
    this.tableColumnData = config.tableColumnData;
    if (config.display) {
      this.display = config.display.bind(this);
    }
  }

  public display(): void {
    if (this.tableColumnData) {
      if (Array.isArray(this.data) && this.data.length) {
        this.ux.table(this.data, this.tableColumnData);
      } else {
        this.ux.log('No results found.');
      }
    }
  }
}

/**
 * Defines a varargs configuration. If set to true, there will be no
 * validation and varargs will not be required.  The validator function
 * should throw an error if validation fails.
 */
export type VarargsConfig =
  | {
      required: boolean;
      validator?: (name: string, value: string) => void;
    }
  | boolean;

/**
 * A base command that provides convenient access to common SFDX flags, a logger,
 * CLI output formatting, scratch orgs, and devhubs.  Extend this command and set
 * various static properties and a flag configuration to add SFDX behavior.
 *
 * @extends @oclif/command
 * @see https://github.com/oclif/command
 */
export abstract class SfdxCommand extends Command {
  // TypeScript does not yet have assertion-free polymorphic access to a class's static side from the instance side
  protected get statics(): typeof SfdxCommand {
    return this.constructor as typeof SfdxCommand;
  }

  // Set to true to add the "targetusername" flag to this command.
  protected static supportsUsername = false;

  // Set to true if this command MUST have a targetusername set, either via
  // a flag or by having a default.
  protected static requiresUsername = false;

  // Set to true to add the "targetdevhubusername" flag to this command.
  protected static supportsDevhubUsername = false;

  // Set to true if this command MUST have a targetdevhubusername set, either via
  // a flag or by having a default.
  protected static requiresDevhubUsername = false;

  // Set to true if this command MUST be run within a SFDX project.
  protected static requiresProject = false;

  // Set if this command is deprecated.
  protected static deprecated?: Deprecation;

  // Convenience property for simple command output table formating.
  protected static tableColumnData: string[];

  // Property to inherit, override, and configure flags
  protected static flagsConfig: FlagsConfig;

  // Use for full control over command output formating and display, or to override
  // certain pieces of default display behavior.
  protected static result: SfdxResult = {};

  // Use to enable or configure varargs style (key=value) parameters.
  protected static varargs: VarargsConfig = false;

  protected logger!: Logger; // assigned in init
  protected ux!: UX; // assigned in init

  // A configAggregator for this command to reference; assigned in init
  protected configAggregator!: SfdxConfigAggregator;

  // An org instance for this command to reference.
  protected org?: Org;

  // A hub org instance for this command to reference.
  protected hubOrg?: Org;

  // An SFDX project for this command to reference.
  protected project?: SfProject;

  // The command output and formatting; assigned in _run
  protected result!: Result;

  // The parsed flags for easy reference by this command; assigned in init
  protected flags!: OutputFlags<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // The parsed args for easy reference by this command; assigned in init
  protected args!: OutputArgs;

  // The parsed varargs for easy reference by this command
  protected varargs?: JsonMap;

  /** event names to be registered for command specific hooks */
  protected readonly lifecycleEventNames: string[] = [];

  private isJson = false;

  public static getVarArgsConfig(): Partial<VarargsConfig> | undefined {
    if (isBoolean(this.varargs)) {
      return this.varargs ? {} : undefined;
    }
    // Don't let others muck with this commands config
    return Object.assign({}, this.varargs);
  }

  public async _run<T>(): Promise<Optional<T>> {
    // If a result is defined for the command, use that.  Otherwise check for a
    // tableColumnData definition directly on the command.
    if (!this.statics.result.tableColumnData && this.statics.tableColumnData) {
      this.statics.result.tableColumnData = this.statics.tableColumnData;
    }
    this.result = new Result(this.statics.result);

    let err: Optional<Error>;
    try {
      await this.init();
      return (this.result.data = await this.run());
    } catch (e) {
      err = e as Error;
      await this.catch(e);
    } finally {
      await this.finally(err);
    }
  }

  // Assign this.project if the command requires to be run from within a project.
  protected async assignProject(): Promise<void> {
    // Throw an error if the command requires to be run from within an SFDX project but we
    // don't have a local config.
    try {
      this.project = await SfProject.resolve();
    } catch (err) {
      if (err instanceof Error && err.name === 'InvalidProjectWorkspace') {
        throw messages.createError('error.RequiresProject');
      }
      throw err;
    }
  }

  // Assign this.org if the command supports or requires a username.
  protected async assignOrg(): Promise<void> {
    // Create an org from the username and set on this
    try {
      this.org = await Org.create({
        aliasOrUsername: this.flags.targetusername,
        aggregator: this.configAggregator,
      });
      if (this.flags.apiversion) {
        this.org.getConnection().setApiVersion(this.flags.apiversion);
      }
    } catch (err) {
      if (this.statics.requiresUsername) {
        if (err instanceof Error && (err.name === 'NoUsernameFoundError' || err.name === 'AuthInfoCreationError')) {
          throw messages.createError('error.RequiresUsername');
        }
        throw err;
      }
    }
  }

  // Assign this.hubOrg if the command supports or requires a devhub username.
  protected async assignHubOrg(): Promise<void> {
    // Create an org from the devhub username and set on this
    try {
      this.hubOrg = await Org.create({
        aliasOrUsername: this.flags.targetdevhubusername,
        aggregator: this.configAggregator,
        isDevHub: true,
      });
      if (this.flags.apiversion) {
        this.hubOrg.getConnection().setApiVersion(this.flags.apiversion);
      }
    } catch (err) {
      // Throw an error if the command requires a devhub and there is no targetdevhubusername
      // flag set and no defaultdevhubusername set.
      if (this.statics.requiresDevhubUsername && err instanceof Error) {
        if (err.name === 'AuthInfoCreationError' || err.name === 'NoUsernameFoundError') {
          throw messages.createError('error.RequiresDevhubUsername');
        }
        throw SfError.wrap(err);
      }
    }
  }

  protected async init(): Promise<void> {
    // If we made it to the init method, the exit code should not be set yet. It will be
    // successful unless the base init or command throws an error.
    process.exitCode = 0;

    // Ensure this.isJson, this.logger, and this.ux are set before super init, flag parsing, or help generation
    // (all of which can throw and prevent these from being available for command error handling).
    const isContentTypeJSON = env.getString('SFDX_CONTENT_TYPE', '').toUpperCase() === 'JSON';
    this.isJson = this.argv.includes('--json') || isContentTypeJSON;

    // Regex match on loglevel flag in argv and set on the root logger so the proper log level
    // is used.  If no match, the default root log level is used.
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const loglevel = this.argv.join(' ').match(/--loglevel\s*=?\s*([a-z]+)/);
    if (loglevel) {
      (await Logger.root()).setLevel(Logger.getLevelByName(loglevel[1]));
    }

    await this.initLoggerAndUx();

    // Finally invoke the super init now that this.ux is properly configured.
    await super.init();

    // Turn off strict parsing if varargs are set.  Otherwise use static strict setting.
    const strict = this.statics.varargs ? !this.statics.varargs : this.statics.strict;

    // Parse the command to get flags and args
    const { args, flags, argv } = await this.parse({
      flags: this.statics.flags,
      args: this.statics.args,
      strict,
    });
    this.flags = flags;
    this.args = args;

    // The json flag was set by the environment variables
    if (isContentTypeJSON) {
      this.flags.json = true;
    }

    this.warnIfDeprecated();

    // If this command supports varargs, parse them from argv.
    if (this.statics.varargs) {
      const argVals: string[] = Object.values(args);
      const varargs = argv.filter((val) => !argVals.includes(val));
      this.varargs = this.parseVarargs(varargs);
    }

    this.logger.info(
      `Running command [${this.statics.name}] with flags [${JSON.stringify(flags)}] and args [${JSON.stringify(args)}]`
    );

    //
    // Verify the command args and flags meet the requirements
    //

    this.configAggregator = await SfdxConfigAggregator.create();

    // Assign this.project if the command requires to be run from within a project.
    if (this.statics.requiresProject) {
      await this.assignProject();
    }

    // Get the apiVersion from the config aggregator and display a warning
    // if it's overridden.
    const apiVersion = this.configAggregator.getInfo('apiVersion');
    if (apiVersion && apiVersion.value && !flags.apiversion) {
      this.ux.warn(messages.getMessage('warning.ApiVersionOverride', [JSON.stringify(apiVersion.value)]));
    }

    // Assign this.org if the command supports or requires a username.
    if (this.statics.supportsUsername || this.statics.requiresUsername) {
      await this.assignOrg();
    }

    // Assign this.hubOrg if the command supports or requires a devhub username.
    if (this.statics.supportsDevhubUsername || this.statics.requiresDevhubUsername) {
      await this.assignHubOrg();
    }

    // register event listeners for command specific hooks
    await this.hooksFromLifecycleEvent(this.lifecycleEventNames);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/explicit-module-boundary-types
  protected async catch(err: any): Promise<void> {
    // Let oclif handle exit signal errors.
    if (err.code === 'EEXIT') {
      throw err;
    }

    // sfdx-core v3 changed error names to end in "Error"
    // to avoid breaking changes across error names across every command that extends SfdxCommand
    // remove the "Error" from the end of the name except for the generic SfError
    err.name = err.name === 'SfError' ? 'SfError' : err.name.replace(/Error$/, '');

    await this.initLoggerAndUx();

    // Convert all other errors to SfErrors for consistency and set the command name on the error.
    const error = SfError.wrap(err);
    error.setContext(this.statics.name);

    process.exitCode = process.exitCode || error.exitCode || 1;

    const userDisplayError = Object.assign(
      { result: error.data, status: error.exitCode },
      {
        ...error.toObject(),
        stack: error.stack,
        warnings: Array.from(UX.warnings),
        // keep commandName key for backwards compatibility
        commandName: error.context,
      }
    );

    if (this.isJson) {
      // This should default to true, which will require a major version bump.
      const sendToStdout = env.getBoolean('SFDX_JSON_TO_STDOUT', true);
      if (sendToStdout) {
        this.ux.logJson(userDisplayError);
      } else {
        this.ux.errorJson(userDisplayError);
      }
    } else {
      this.ux.error(...this.formatError(error));

      if (err.data) {
        this.result.data = err.data;
        this.result.display();
      }
    }
    // Emit an event for the analytics plugin.  The ts-ignore is necessary
    // because TS is strict about the events that can be emitted on process.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    process.emit('cmdError', err, Object.assign({}, this.flags, this.varargs), this.org || this.hubOrg);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async finally(err: Optional<Error>): Promise<void> {
    // Only handle success since we're handling errors in the catch
    if (!err) {
      if (this.isJson) {
        let output = this.getJsonResultObject();
        if (UX.warnings.size > 0) {
          output = Object.assign(output, {
            warnings: Array.from(UX.warnings),
          });
        }
        this.ux.logJson(output);
      } else {
        this.result.display();
      }
    }
  }

  // If this command is deprecated, emit a warning
  protected warnIfDeprecated(): void {
    if (this.statics.deprecated) {
      let def: DeprecationDefinition;
      if (has(this.statics.deprecated, 'version')) {
        def = {
          name: this.statics.name,
          type: 'command',
          ...this.statics.deprecated,
        };
      } else {
        def = this.statics.deprecated;
      }
      this.ux.warn(UX.formatDeprecationWarning(def));
    }

    if (this.statics.flagsConfig) {
      // If any deprecated flags were passed, emit warnings
      for (const flag of Object.keys(this.flags)) {
        const def = this.statics.flagsConfig[flag];
        if (def && def.deprecated) {
          this.ux.warn(
            UX.formatDeprecationWarning({
              name: flag,
              type: 'flag',
              ...def.deprecated,
            })
          );
        }
      }
    }
  }

  protected getJsonResultObject(
    result = this.result.data,
    status = process.exitCode || 0
  ): { status: number; result: AnyJson } {
    return { status, result };
  }

  protected parseVarargs(args: string[] = []): JsonMap {
    const varargs: Dictionary<string> = {};
    const descriptor = this.statics.varargs;

    // If this command requires varargs, throw if none are provided.
    if (!args.length && !isBoolean(descriptor) && descriptor.required) {
      throw messages.createError('error.VarargsRequired');
    }

    // Validate the format of the varargs
    args.forEach((arg) => {
      const split = arg.split('=');

      if (split.length !== 2) {
        throw messages.createError('error.InvalidVarargsFormat', [arg]);
      }

      const [name, value] = split;

      if (varargs[name]) {
        throw messages.createError('error.DuplicateVarargs', [name]);
      }

      if (!isBoolean(descriptor) && descriptor.validator) {
        descriptor.validator(name, value);
      }

      varargs[name] = value || undefined;
    });

    return varargs;
  }

  /**
   * Format errors and actions for human consumption. Adds 'ERROR running <command name>',
   * and outputs all errors in red.  When there are actions, we add 'Try this:' in blue
   * followed by each action in red on its own line.
   *
   * @returns {string[]} Returns decorated messages.
   */
  protected formatError(error: SfError): string[] {
    const colorizedArgs: string[] = [];
    const commandName = this.id || error.context;
    const runningWith = commandName ? ` running ${commandName}` : '';
    colorizedArgs.push(chalk.bold(`ERROR${runningWith}: `));
    colorizedArgs.push(chalk.red(error.message));

    // Format any actions.
    if (get(error, 'actions.length')) {
      colorizedArgs.push(`\n\n${chalk.blue(chalk.bold('Try this:'))}`);
      if (error.actions) {
        error.actions.forEach((action: string) => {
          colorizedArgs.push(`\n${chalk.red(action)}`);
        });
      }
    }
    if (error.stack && Global.getEnvironmentMode() === Mode.DEVELOPMENT) {
      colorizedArgs.push(chalk.red(`\n*** Internal Diagnostic ***\n\n${error.stack}\n******\n`));
    }

    return colorizedArgs;
  }

  /**
   * Initialize logger and ux for the command
   */
  protected async initLoggerAndUx(): Promise<void> {
    if (!this.logger) {
      this.logger = await Logger.child(this.statics.name);
    }
    if (!this.ux) {
      this.ux = new UX(this.logger, !this.isJson);
    }
    if (this.result && !this.result.ux) {
      this.result.ux = this.ux;
    }
  }

  /**
   * register events for command specific hooks
   */
  private async hooksFromLifecycleEvent(lifecycleEventNames: string[]): Promise<void> {
    const options = {
      Command: this.ctor,
      argv: this.argv,
      commandId: this.id,
    };

    const lifecycle = Lifecycle.getInstance();

    lifecycleEventNames.forEach((eventName) => {
      lifecycle.on(eventName, async (result: AnyJson) => {
        await this.config.runHook(eventName, Object.assign(options, { result }));
      });
    });
  }

  // Overrides @oclif/command static flags property.  Adds username flags
  // if the command supports them.  Builds flags defined by the command's
  // flagsConfig static property.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static get flags(): Flags.Input<any> {
    return buildSfdxFlags(this.flagsConfig, {
      targetdevhubusername: this.supportsDevhubUsername || this.requiresDevhubUsername,
      targetusername: this.supportsUsername || this.requiresUsername,
    });
  }

  public static get usage(): string {
    return DocOpts.generate(this);
  }

  /**
   * Actual command run code goes here.
   *
   * @returns {Promise<any>} Returns a promise
   * @throws {Error | SfError} Throws an error. If the error is not an SfError, it will
   * be wrapped in an SfError. If the error contains exitCode field, process.exitCode
   * will set to it.
   */
  public abstract run(): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
