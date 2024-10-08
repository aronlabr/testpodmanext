import { Octokit } from '@octokit/rest';
import * as extensionApi from '@podman-desktop/api';

// import { getDistros } from './wsl';
import { Download, ToolConfig } from './download';
// import { Detect } from './detect';
import { GitHubReleases } from './github-releases';
import { copyBinsToInstace, getDistros } from './wsl';
import { checkBinInstalled } from './handler';
import path from 'node:path';
// import path from 'node:path';
// import { existsSync, promises } from 'node:fs';
// import { extract } from './cli-run';

const extDescription = `This extension provides podman integration with wsl using only stand-alone binaries.\nInstalling and configuring:\n* podman-remote\n* docker-compose`;

const extInfo: extensionApi.ProviderOptions = {
  name: 'WSL integration lite',
  id: 'wslite',
  status: 'unknown',
  images: {
    icon: './icon.png',
  },
  emptyConnectionMarkdownDescription: extDescription
}

const wslTools: ToolConfig[] = [
  {
    name: 'docker-compose',
    gh: {
      owner: 'docker',
      repo: 'compose',
    },
    extension: '',
    archMap: {
      x64: 'x86_64',
      arm64: 'aarch64',
    },
    release: null,
  },
  {
    name: 'podman-remote-static',
    gh: {
      owner: 'containers',
      repo: 'podman',
    },
    extension: '.tar.gz',
    archMap: {
      x64: 'amd64',
      arm64: 'arm64',
    },
    release: null,
  },
]

// // create an item in the status bar to run our command
// // it will stick on the left of the status bar
// const item = extensionApi.window.createStatusBarItem(extensionApi.StatusBarAlignLeft, 100);
// item.text = 'My first command';
// item.command = `${extInfo.id}.hello2`;
// item.show();

// Telemetry
let telemetryLogger: extensionApi.TelemetryLogger | undefined;

export function initTelemetryLogger(): void {
  telemetryLogger = extensionApi.env.createTelemetryLogger();
}



// Activate the extension asynchronously
export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  initTelemetryLogger();
  // await getDistros();
  const octokit = new Octokit();
  const releases = new GitHubReleases(octokit);
  const downloadManager = new Download(extensionContext, releases)

  await checkBinInstalled(extensionContext, wslTools)

  const checkDownload = extensionApi.commands.registerCommand(
    `${extInfo.id}.onboarding.checkDownloadedCommand`,
    async () => {
      await Promise.all(
        wslTools.map(async tool => {
          downloadManager.tool = tool
          const isDownloaded = downloadManager.checkDownloadedTool()
          extensionApi.context.setValue(`${tool.gh.repo}IsDownloaded`, isDownloaded, 'onboarding');

          if (!isDownloaded) {
            // Get the latest version and store the metadata in a local variable
            const toolLatestVersion = await downloadManager.getLatestVersionAsset();
            // Set the value in the context to the version we're downloading so it appears in the onboarding sequence
            if (toolLatestVersion) {
              tool.release = toolLatestVersion;
              extensionApi.context.setValue(`${tool.gh.repo}DownloadVersion`, tool.release.tag, 'onboarding');
            }
          }
          // Log if it's downloaded and what version is being selected for download (can be either latest, or chosen by user)
          telemetryLogger?.logUsage(`${extInfo.id}.onboarding.checkDownloadedCommand`, {
            tool: tool.gh.repo,
            downloaded: isDownloaded,
            version: tool.release?.tag,
          });
        })
      );
    },
  )

  const execDownload = extensionApi.commands.registerCommand(
    `${extInfo.id}.onboarding.downloadCommand`,
    async () => {
      let toolDownloaded: Boolean[] = [];
      for (const tool of wslTools) {
        downloadManager.github = tool.gh
        if (!tool.release) {
          tool.release = await downloadManager.getLatestVersionAsset();
        }
        let downloaded: Boolean = false
        try {
          await downloadManager.download(tool);
          downloaded = true
          toolDownloaded.push(downloaded);
        } finally {
          telemetryLogger?.logUsage(`${extInfo.id}.onboarding.downloadCommand`, {
            successful: downloaded,
            version: tool.release?.tag,
          });
        }
      }
      const areDownloaded = toolDownloaded.every(v => v);
      extensionApi.context.setValue('binsAreDownloaded', areDownloaded, 'onboarding');
      extensionApi.context.setValue('wslite.binsAreInstalled', areDownloaded);
    }
  )

  const cpBinsCommand = extensionApi.commands.registerCommand(`${extInfo.id}.list`, async () => {
    // display a choice to the user for selecting some values
    const wslInstaces = await getDistros();
    const instancesNames = wslInstaces.map(instance => instance.name);
    const result = await extensionApi.window.showQuickPick(instancesNames, {
      canPickMany: true, // user can select more than one choice
    });

    if (!result) {
      await extensionApi.window.showInformationMessage(`No result choosed`);
      return
    } 
    const binStorage = path.join(extensionContext.storagePath, 'bin')
    for (const instance of result) {
      await copyBinsToInstace(wslTools, instance, binStorage)
    }
    // display an information message with the user choice
    await extensionApi.window.showInformationMessage(`The choice was: ${result}`);
  });

  // const provider = extensionApi.provider.createProvider(extInfo);

  extensionContext.subscriptions.push(
    checkDownload,
    execDownload,
    cpBinsCommand
  );

  // Push the new provider to Podman Desktop
  // extensionContext.subscriptions.push(provider);

}

// Deactivate the extension
export function deactivate(): void {
  console.log('stopping wsl-int extension');
}

// extensionApi.InputBoxOptions

// const telemetryConfigurationNode = {
//   id: 'preferences.telemetry',
//   title: 'Telemetry',
//   type: 'object',
//   properties: {
//     ['wsl' + '.' + 'enabled']: {
//       markdownDescription:
//         'Help improve Podman Desktop by allowing anonymous usage data to be sent to Red Hat. Read our [Privacy statement](https://developers.redhat.com/article/tool-data-collection)',
//       type: 'boolean',
//       default: true,
//     },
//     ['wsl' + '.' + 'checked']: {
//       description: 'Dialog prompt for telemetry',
//       type: 'boolean',
//       default: false,
//       hidden: true,
//     },
//   },
// };

// this.configurationRegistry.registerConfigurations([telemetryConfigurationNode]);