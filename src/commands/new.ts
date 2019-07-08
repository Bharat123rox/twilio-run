import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { fetchListOfTemplates, getTemplateFiles } from '../templating/data';
import { writeFiles } from '../templating/filesystem';
import { Arguments, Argv } from 'yargs';
import { Merge } from 'type-fest';
import { CliInfo } from './types';

export type NewCliFlags = Arguments<{
  filename?: string;
  template?: string;
  list?: string;
}>;

export type NewConfig = Merge<
  NewCliFlags,
  {
    template: string;
    filename: string;
  }
>;

async function listTemplates(): Promise<void> {
  const spinner = ora('Fetching available templates').start();

  let templates;
  try {
    templates = await fetchListOfTemplates();
  } catch (err) {
    spinner.fail('Failed to retrieve templates');
    process.exit(1);
    return;
  }

  spinner.stop();

  templates.forEach(template => {
    console.log(
      chalk`‣ ${template.name} ({cyan ${template.id}})\n  {dim ${template.description}}`
    );
  });
}

async function getMissingInfo(flags: NewCliFlags): Promise<NewConfig> {
  const questions: prompts.PromptObject[] = [];
  if (!flags.template) {
    const templates = await fetchListOfTemplates();
    const choices = templates.map(template => {
      return {
        title: chalk`${template.name} - {dim ${template.description}}`,
        value: template.id,
      };
    });
    questions.push({
      type: 'select',
      name: 'template',
      message: 'Select a template',
      choices,
    });
  }

  if (!flags.filename) {
    questions.push({
      type: 'text',
      name: 'filename',
      message: 'What should be the name of your function?',
      validate: (input: string) => {
        if (input.length < 1 || input.includes(' ')) {
          return 'Your name cannot include whitespace';
        }
        return true;
      },
    });
  }

  if (questions.length === 0) {
    return {
      ...flags,
      filename: flags.filename as string,
      template: flags.template as string,
    };
  }

  const answers = await prompts(questions);
  return {
    ...flags,
    template: flags.template || answers.template,
    filename: flags.filename || answers.filename,
  };
}

function getBaseDirectoryPath(): string {
  const currentDir = process.cwd();
  const baseName = path.basename(currentDir);
  if (
    baseName === 'functions' ||
    baseName === 'assets' ||
    baseName === 'src' ||
    baseName === 'static'
  ) {
    return path.resolve(currentDir, '..');
  }
  return currentDir;
}

export async function handler(flagsInput: NewCliFlags): Promise<void> {
  if (flagsInput.list) {
    await listTemplates();
    process.exit(0);
    return;
  }

  const flags = await getMissingInfo(flagsInput);
  const targetDirectory = getBaseDirectoryPath();
  const functionName = flags.filename.replace(/\.js$/, '');
  const files = await getTemplateFiles(flags.template, functionName);
  try {
    await writeFiles(files, targetDirectory, functionName);
    console.log(chalk`{green SUCCESS} Created new function ${functionName}`);
  } catch (err) {
    console.error(chalk`{red ERROR} ${err.message}`);
  }
}

export const cliInfo: CliInfo = {
  options: {
    template: {
      type: 'string',
      description: 'Name of template to be used',
    },
    list: {
      type: 'boolean',
      alias: 'l',
      describe: chalk`List available templates. Will {bold not} create a new function`,
    },
  },
};

function optionBuilder(yargs: Argv<any>): Argv<NewCliFlags> {
  yargs = yargs
    .example(
      '$0 new hello-world --template=blank',
      'Creates a basic blank template as hello-world function'
    )
    .example('$0 new --list', 'Lists all available templates');

  yargs = Object.keys(cliInfo.options).reduce((yargs, name) => {
    return yargs.option(name, cliInfo.options[name]);
  }, yargs);

  return yargs;
}

export const command = ['new [filename]', 'template [filename]'];
export const describe =
  'Creates a new Twilio Function based on an existing template';
export const builder = optionBuilder;
