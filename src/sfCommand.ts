/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Command, HelpSection, Interfaces } from '@oclif/core';

export interface SfCommandInterface extends Interfaces.Command {
  configurationVariablesSection?: HelpSection;
  envVariablesSection?: HelpSection;
  errorCodes?: HelpSection;
}

/**
 * A base command that provides convenient access to common SFDX flags, a logger,
 * CLI output formatting, scratch orgs, and devhubs.  Extend this command and set
 * various static properties and a flag configuration to add SFDX behavior.
 *
 * @extends @oclif/command
 * @see https://github.com/oclif/command
 */

export abstract class SfCommand extends Command {
  public static configurationVariablesSection?: HelpSection;
  public static envVariablesSection?: HelpSection;
  public static errorCodes?: HelpSection;
}
