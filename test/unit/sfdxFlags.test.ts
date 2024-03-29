/*
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { fail } from 'assert';
import { expect } from 'chai';
import { Messages, SfError } from '@salesforce/core';
import { Duration, NamedError } from '@salesforce/kit';
import { hasFunction } from '@salesforce/ts-types';
import { buildSfdxFlags, flags } from '../../src/sfdxFlags';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/command', 'flags');

class MissingPropertyError extends NamedError {
  public constructor(property: string, flag: string) {
    super(`Missing property '${property}' for '${flag}'`);
  }
}

describe('SfdxFlags', () => {
  const containsRequiredFlags = (rv: flags.Output) => {
    expect(rv.json).to.include({ type: 'boolean', kind: 'boolean' });
    expect(rv.loglevel).to.include({ type: 'option', kind: 'enum' });
  };

  describe('buildSfdxFlags', () => {
    it('should always return json and loglevel flags', () => {
      const rv = buildSfdxFlags({}, {});
      expect(Object.keys(rv).length).to.equal(2);
      containsRequiredFlags(rv);
    });

    it('should add targetdevhubusername and apiversion', () => {
      const rv = buildSfdxFlags({}, { targetdevhubusername: true });
      expect(Object.keys(rv).length).to.equal(4);
      containsRequiredFlags(rv);
      expect(rv.targetdevhubusername).to.have.property(
        'description',
        messages.getMessage('flags.targetdevhubusername.description')
      );
      expect(rv.apiversion).to.have.property('description', messages.getMessage('flags.apiversion.description'));
    });

    it('should add targetusername and apiversion', () => {
      const rv = buildSfdxFlags({}, { targetusername: true });
      expect(Object.keys(rv).length).to.equal(4);
      containsRequiredFlags(rv);
      expect(rv.targetusername).to.have.property(
        'description',
        messages.getMessage('flags.targetusername.description')
      );
      expect(rv.apiversion).to.have.property('description', messages.getMessage('flags.apiversion.description'));
    });

    it('should carry forward additional properties on builtins when forced (for legacy toolbelt compatibility)', () => {
      const rv = buildSfdxFlags(
        {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore force setting the char to simulate a legacy toolbelt use case
          apiversion: flags.builtin({ char: 'a' }),
        },
        {}
      );
      expect(rv.apiversion).to.have.property('description', messages.getMessage('flags.apiversion.description'));
      expect(rv.apiversion).to.have.property('char', 'a');
    });

    it('should add builtin flags', () => {
      const rv = buildSfdxFlags(
        {
          concise: flags.builtin(),
          verbose: flags.builtin(),
          quiet: flags.builtin(),
          apiversion: flags.builtin(),
        },
        {}
      );
      expect(Object.keys(rv).length).to.equal(6);
      containsRequiredFlags(rv);
      expect(rv.concise).to.have.property('description', messages.getMessage('flags.concise.description'));
      expect(rv.verbose).to.have.property('description', messages.getMessage('flags.verbose.description'));
      expect(rv.quiet).to.have.property('description', messages.getMessage('flags.quiet.description'));
      expect(rv.apiversion).to.have.property('description', messages.getMessage('flags.apiversion.description'));
    });

    it('should add oclif type flags', () => {
      const rv = buildSfdxFlags(
        {
          mybool: flags.boolean({ description: 'mybool desc' }),
          myhelp: flags.help({ description: 'myhelp desc' }),
          myinteger: flags.integer({ description: 'myinteger desc' }),
          mystring: flags.string({ description: 'mystring desc' }),
          myoption: flags.option({ description: 'myoption desc', parse: (i: string) => Promise.resolve(i) }),
          myversion: flags.version({ description: 'myversion desc' }),
        },
        {}
      );
      expect(Object.keys(rv).length).to.equal(8);
      containsRequiredFlags(rv);
      expect(rv.mybool).to.include({ description: 'mybool desc', kind: 'boolean' });
      expect(rv.myhelp).to.include({ description: 'myhelp desc', kind: 'help' });
      expect(rv.myinteger).to.include({ description: 'myinteger desc', kind: 'integer' });
      expect(rv.mystring).to.include({ description: 'mystring desc', kind: 'string' });
      expect(rv.myversion).to.include({ description: 'myversion desc', kind: 'version' });
    });

    it('should add sfdx type flags', () => {
      const rv = buildSfdxFlags(
        {
          myarray: flags.array({ description: 'myarray desc' }),
          mydate: flags.date({ description: 'mydate desc' }),
          mydatetime: flags.datetime({ description: 'mydatetime desc' }),
          mydirectory: flags.directory({ description: 'mydirectory desc' }),
          myemail: flags.email({ description: 'myemail desc' }),
          myfilepath: flags.filepath({ description: 'myfilepath desc' }),
          myid: flags.id({ description: 'myid desc' }),
          mynumber: flags.number({ description: 'mynumber desc' }),
          myurl: flags.url({ description: 'myurl desc' }),
        },
        {}
      );
      expect(Object.keys(rv).length).to.equal(11);
      containsRequiredFlags(rv);
      expect(rv.myarray).to.include({ description: 'myarray desc', kind: 'array' });
      expect(rv.mydate).to.include({ description: 'mydate desc', kind: 'date' });
      expect(rv.mydatetime).to.include({ description: 'mydatetime desc', kind: 'datetime' });
      expect(rv.mydirectory).to.include({ description: 'mydirectory desc', kind: 'directory' });
      expect(rv.myemail).to.include({ description: 'myemail desc', kind: 'email' });
      expect(rv.myfilepath).to.include({ description: 'myfilepath desc', kind: 'filepath' });
      expect(rv.myid).to.include({ description: 'myid desc', kind: 'id' });
      expect(rv.mynumber).to.include({ description: 'mynumber desc', kind: 'number' });
      expect(rv.mydate).to.include({ description: 'mydate desc', kind: 'date' });
      expect(rv.myurl).to.include({ description: 'myurl desc', kind: 'url' });
    });

    it('should throw for an unknown builtin flag', () => {
      try {
        buildSfdxFlags({ foo: flags.builtin() }, {});
        fail('referencing an unknown builtin flag should have failed.');
      } catch (e) {
        if (!(e instanceof Error)) {
          fail('error with no name');
        }
        expect(e.name).to.equal('UnknownBuiltinFlagTypeError');
      }
    });
  });

  describe('validate', () => {
    it('should throw for a validated oclif base flag type with an invalid value', () => {
      const flag = flags.string({ description: 'string', validate: /[0-9]+/ });
      if (!hasFunction(flag, 'parse')) throw new MissingPropertyError('parse', 'integer');
      expect(() => flag.parse('foo')).to.throw(
        SfError,
        'The flag value "foo" is not in the correct format for "string."'
      );
    });

    // and another to test a custom flag type
    it('should throw for a validated sfdx custom flag type with an invalid value', () => {
      const flag = flags.date({
        description: 'string',
        // not a date but sufficient for testing since it shouldn't get far enough to parse
        validate: '^date$',
      });
      if (!hasFunction(flag, 'parse')) throw new MissingPropertyError('parse', 'date');
      expect(() => flag.parse('foo')).to.throw(
        SfError,
        'The flag value "foo" is not in the correct format for "date."'
      );
    });

    // eslint-disable-next-line complexity
    it('should throw for numeric flags with values out of bounds', async () => {
      const integer = flags.integer({ description: 'integer', min: 2, max: 4 });
      const number = flags.number({ description: 'number', min: 2, max: 4 });

      if (!hasFunction(integer, 'parse')) throw new MissingPropertyError('parse', 'integer');
      expect(await integer.parse('3')).to.equal(3);

      try {
        await integer.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected integer greater than or equal to 2 but received 1');
      }

      try {
        await integer.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected integer less than or equal to 4 but received 5');
      }

      if (!hasFunction(number, 'parse')) throw new MissingPropertyError('parse', 'number');
      expect(await number.parse('2.5')).to.equal(2.5);

      try {
        await number.parse('1.5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected number greater than or equal to 2 but received 1.5');
      }

      try {
        await number.parse('4.5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected number less than or equal to 4 but received 4.5');
      }

      const milliseconds = flags.milliseconds({ description: 'milliseconds', min: 2, max: 4 });
      const minutes = flags.minutes({ description: 'minutes', min: 2, max: 4 });
      const seconds = flags.seconds({ description: 'seconds', min: 2, max: 4 });

      if (!hasFunction(milliseconds, 'parse')) throw new MissingPropertyError('parse', 'milliseconds');
      expect(await milliseconds.parse('2')).to.deep.equal(Duration.milliseconds(2));

      try {
        await milliseconds.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected milliseconds greater than or equal to 2 but received 1');
      }

      try {
        await milliseconds.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected milliseconds less than or equal to 4 but received 5');
      }

      if (!hasFunction(minutes, 'parse')) throw new MissingPropertyError('parse', 'minutes');
      expect(await minutes.parse('4')).to.deep.equal(Duration.minutes(4));

      try {
        await minutes.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected minutes greater than or equal to 2 but received 1');
      }

      try {
        await minutes.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected minutes less than or equal to 4 but received 5');
      }

      if (!hasFunction(seconds, 'parse')) throw new MissingPropertyError('parse', 'seconds');
      expect(await seconds.parse('3')).to.deep.equal(Duration.seconds(3));

      try {
        await seconds.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected seconds greater than or equal to 2 but received 1');
      }

      try {
        await seconds.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected seconds less than or equal to 4 but received 5');
      }

      const milliseconds2 = flags.milliseconds({
        description: 'milliseconds',
        min: Duration.milliseconds(2),
        max: Duration.milliseconds(4),
      });
      const minutes2 = flags.minutes({ description: 'minutes', min: Duration.minutes(2), max: Duration.minutes(4) });
      const seconds2 = flags.seconds({ description: 'seconds', min: Duration.seconds(2), max: Duration.seconds(4) });

      if (!hasFunction(milliseconds2, 'parse')) throw new MissingPropertyError('parse', 'milliseconds');
      expect(await milliseconds2.parse('2')).to.deep.equal(Duration.milliseconds(2));

      try {
        await milliseconds2.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected milliseconds greater than or equal to 2 but received 1');
      }

      try {
        await milliseconds2.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected milliseconds less than or equal to 4 but received 5');
      }

      if (!hasFunction(minutes2, 'parse')) throw new MissingPropertyError('parse', 'minutes');
      expect(await minutes2.parse('4')).to.deep.equal(Duration.minutes(4));

      try {
        await minutes2.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected minutes greater than or equal to 2 but received 1');
      }

      try {
        await minutes2.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected minutes less than or equal to 4 but received 5');
      }

      if (!hasFunction(seconds2, 'parse')) throw new MissingPropertyError('parse', 'seconds');
      expect(await seconds2.parse('3')).to.deep.equal(Duration.seconds(3));

      try {
        await seconds2.parse('1');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected seconds greater than or equal to 2 but received 1');
      }

      try {
        await seconds2.parse('5');
        fail('the above should throw');
      } catch (e) {
        const err = e as SfError;
        expect(err).to.not.be.undefined;
        expect(err.message).to.equal('Expected seconds less than or equal to 4 but received 5');
      }
    });

    describe('arrays', () => {
      it('should not throw for options array with valid values', async () => {
        const array = flags.array({ description: 'test', options: ['1', '3', '5'] });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal(['1', '3', '5']);
      });

      it('should not throw for validated array with valid values', async () => {
        const array = flags.array({ description: 'test', validate: /[0-9]+/ });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal(['1', '3', '5']);
      });

      it('should throw for options array with invalid values', async () => {
        const array = flags.array({ description: 'test', validate: /[0-9]+/ });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');

        try {
          await array.parse('1,2,c');
          fail('the above should throw');
        } catch (e) {
          const err = e as SfError;
          expect(err).to.not.be.undefined;
          expect(err.message).to.equal(
            'The flag value "1,2,c" is not in the correct format for "array." Must only contain valid values.'
          );
        }
      });

      it('should not throw for validated/options array with valid values', async () => {
        const array = flags.array({ description: 'test', validate: (s) => /[0-9]+/.test(s), options: ['1', '3', '5'] });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal(['1', '3', '5']);
      });

      it('should throw for validated/options array with invalid values', async () => {
        const array = flags.array({ description: 'test', validate: (s) => /[0-9]+/.test(s), options: ['7', '8', '9'] });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        // expect validations to fail before options checking
        try {
          await array.parse('1,2,c');
          fail('the above should throw');
        } catch (e) {
          const err = e as SfError;
          expect(err).to.not.be.undefined;
          expect(err.message).to.equal(
            'The flag value "1,2,c" is not in the correct format for "array." Must only contain valid values.'
          );
        }
      });

      it('should not throw for options mapped array with valid values', async () => {
        const array = flags.array({ description: 'test', map: (v: string) => parseInt(v, 10), options: [1, 3, 5] });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal([1, 3, 5]);
      });

      it('should throw for options mapped array with invalid values', async () => {
        const array = flags.array({ description: 'test', map: (v: string) => parseInt(v, 10), options: [1, 3, 5] });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');

        try {
          await array.parse('1,2,3');
          fail('the above should throw');
        } catch (e) {
          const err = e as SfError;
          expect(err).to.not.be.undefined;
          expect(err.message).to.equal(
            'The flag value "1,2,3" is not in the correct format for "array." Must only contain values in [1,3,5].'
          );
        }
      });

      it('should not throw for validated mapped array with valid values', async () => {
        const array = flags.array({ description: 'test', map: (v: string) => parseInt(v, 10), validate: /[0-9]+/ });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal([1, 3, 5]);
      });

      it('should throw for validated mapped array with invalid values', async () => {
        const array = flags.array({ description: 'test', map: (v: string) => parseInt(v, 10), validate: /[0-9]+/ });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');

        try {
          await array.parse('1,2,c');
          fail('the above should throw');
        } catch (e) {
          const err = e as SfError;
          expect(err).to.not.be.undefined;
          expect(err.message).to.equal(
            'The flag value "1,2,c" is not in the correct format for "array." Must only contain valid values.'
          );
        }
      });

      it('should not throw for validated/options mapped array with valid values', async () => {
        const array = flags.array({
          description: 'test',
          map: (v: string) => parseInt(v, 10),
          validate: '[0-9]+',
          options: [1, 3, 5],
        });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1,3,5')).to.deep.equal([1, 3, 5]);
      });

      it('should throw for validated/options mapped array with invalid values', async () => {
        const array = flags.array({
          description: 'test',
          map: (v: string) => parseInt(v, 10),
          validate: '[0-9]+',
          options: [7, 8, 9],
        });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        // expect validations to fail before options checking
        try {
          await array.parse('1,2,c');
          fail('the above should throw');
        } catch (e) {
          const err = e as SfError;
          expect(err).to.not.be.undefined;
          expect(err.message).to.equal(
            'The flag value "1,2,c" is not in the correct format for "array." Must only contain valid values.'
          );
        }
      });

      it('should handle various arrangements of comma separated lists without errors', async () => {
        const array = flags.array({ description: 'test' });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('"1, 2, 3, 4, 5, 6"')).to.deep.equal(['1, 2, 3, 4, 5, 6']);
        expect(await array.parse('1,2,3,4,5,6')).to.deep.equal(['1', '2', '3', '4', '5', '6']);
        expect(await array.parse('"1, 2","3, 4","5, 6"')).to.deep.equal(['1, 2', '3, 4', '5, 6']);
        expect(await array.parse('1,"2, 3","4, 5",6')).to.deep.equal(['1', '2, 3', '4, 5', '6']);
        expect(await array.parse('"1, 2",3,4,"5, 6"')).to.deep.equal(['1, 2', '3', '4', '5, 6']);
        expect(await array.parse("'1,2','3,4','5,6'")).to.deep.equal(['1,2', '3,4', '5,6']);
        expect(await array.parse("'1,2',3,4,'5,6'")).to.deep.equal(['1,2', '3', '4', '5,6']);
        expect(await array.parse("1,'2, 3','4, 5',6")).to.deep.equal(['1', '2, 3', '4, 5', '6']);
      });

      it('should handle custom delimiter', async () => {
        const array = flags.array({ description: 'test', delimiter: ';' });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1;2;3;4;5')).to.deep.equal(['1', '2', '3', '4', '5']);
      });

      it('should handle custom delimiter with mappedArray', async () => {
        const array = flags.array({ description: 'test', delimiter: ';', map: (v: string) => `${v}x` });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1;2;3;4;5')).to.deep.equal(['1x', '2x', '3x', '4x', '5x']);
      });

      it('should strip whitespace from parsed array members', async () => {
        const array = flags.array({ description: 'test' });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1, 2, 3, 4, 5')).to.deep.equal(['1', '2', '3', '4', '5']);
        expect(await array.parse('1 ,2 ,3 ,4 ,5')).to.deep.equal(['1', '2', '3', '4', '5']);
      });

      it('should strip whitespace from parsed mapped string array members', async () => {
        const array = flags.array({ description: 'test', map: (v: string) => `${v}x` });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1, 2, 3, 4, 5')).to.deep.equal(['1x', '2x', '3x', '4x', '5x']);
        expect(await array.parse('1 ,2 ,3 ,4 ,5')).to.deep.equal(['1x', '2x', '3x', '4x', '5x']);
      });

      it('should handle custom delimiter and whitespace', async () => {
        const array = flags.array({ description: 'test', delimiter: ';' });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1; 2; 3; 4; 5')).to.deep.equal(['1', '2', '3', '4', '5']);
      });

      it('should handle custom delimiter with mappedArray and whitespace', async () => {
        const array = flags.array({ description: 'test', delimiter: ';', map: (v: string) => `${v}x` });
        if (!hasFunction(array, 'parse')) throw new MissingPropertyError('parse', 'array');
        expect(await array.parse('1; 2; 3; 4; 5')).to.deep.equal(['1x', '2x', '3x', '4x', '5x']);
      });
    });

    describe('usage', () => {
      it('should echo back any builtin flag options', () => {
        const rv = flags.builtin();
        expect(rv).to.deep.equal({ type: 'builtin' });
      });

      it('should allow empty builtin flag options', () => {
        const rv = flags.builtin({});
        expect(rv).to.deep.equal({ type: 'builtin' });
      });

      it('should allow desc and long desc builtin flag options', () => {
        const rv = flags.builtin({ description: 'desc', longDescription: 'long desc' });
        expect(rv).to.deep.equal({ description: 'desc', longDescription: 'long desc', type: 'builtin' });
      });

      it('should support adding deprecation information', () => {
        const rv = flags.string({ description: 'any flag', deprecated: { message: 'do not use', version: '41.0' } });
        expect(rv.deprecated).to.deep.equal({ message: 'do not use', version: '41.0' });
      });
    });
  });

  describe('parse', () => {
    it('parse on string flag', async () => {
      const flag = flags.string({
        description: 'test',
        parse: (input: string) => Promise.resolve(input.toUpperCase()),
      });
      if (!hasFunction(flag, 'parse')) throw new MissingPropertyError('parse', 'array');

      expect(await flag.parse('foo', undefined, undefined)).to.equal('FOO');
    });
  });
});
