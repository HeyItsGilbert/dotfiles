# dotfiles

Gilbert's dot files. Thanks to @mikedodge04 for helping me setup a bunch of
these a while ago.

Please note that there may be files from other repositories. These files are
have been accumalted over a long period of time. If you find some code the
belongs to someone else, please let me know so I can properly attribute them.

## Pre-Requisites

- A Nerdfont (I prefer Hack) https://www.nerdfonts.com/
- ZSH: https://www.zsh.org/
- Oh-my-zsh: https://github.com/robbyrussell/oh-my-zsh
- pathogen: https://github.com/tpope/vim-pathogen
- Solarized theme: http://ethanschoonover.com/solarized/vim-colors-solarized

## App Installs

The setup will also install some applications, please take care to review the
scripts to make sure you want those installed.

## Setup

I previously recommended moving the files but that makes updating them more
painful. Instead I recommend using symlinks and if you run the install scripts
that's what they'll do.

```bash
git clone git@github.com:HeyItsGilbert/dotfiles.git
cd dotfiles
./setup.sh
```

```powershell
git clone git@github.com:HeyItsGilbert/dotfiles.git
cd dotfiles
. .\setup.ps1
```
