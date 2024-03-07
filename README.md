# HeyItsGilbert's dotfiles!

This repo is set up with @twpayne/chezmoi. Chezmoi will also install some
applications, please take care to review the scripts to make sure you want those
installed.

> [!CAUTION]
> You probably don't want to just install this. I suggest cloning OR copying
> changes to your own dotfiles repo.

## Setup

> [!NOTE]
> All the scripts run with Pwsh so you need that in place first.

### For Windows
Install Chocolatey then install pre-requisites.
```shell
choco install chezmoi delta git pwsh
```

### For all
```shell
chezmoi init --apply --verbose https://github.com/HeyItsGilbert/dotfiles.git
```

> [!NOTE]
> Please note that there may be files from other repositories. These files have
> been accumulated over a long period of time. If you find some code the
> belongs to someone else, please let me know, so I can properly attribute them.
