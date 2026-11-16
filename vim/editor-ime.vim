if exists('g:loaded_editor_ime_mode') | finish | endif
let g:loaded_editor_ime_mode = 1
let s:english = get(g:, 'editor_ime_commandline_english', 1)
let s:helper = expand('<sfile>:p:h:h') . '/context.py'
let s:state = ''
let s:job = v:null
if !has('gui_running') && has('job') && !empty($DISPLAY) && empty($TMUX) && empty($STY)
 let s:state = tempname()
 call writefile([json_encode({'pid':getpid(), 'restricted':0})], s:state)
 call setfperm(s:state, 'rw-------')
 let s:job = job_start(['python3', s:helper, '--watch', string(getpid()), '--state', s:state], {'out_io':'null', 'err_io':'null'})
endif
if has('gui_running')
 let $IBUS_DISABLE_SNOOPER = '1'
 if exists('+imcmdline') | set imcmdline | endif
 if empty(&imactivatefunc)
  function! EditorImePreserveContext(active) abort
  endfunction
  let &imactivatefunc = 'EditorImePreserveContext'
 endif
 if !hasmapto('<C-R><C-O>+', 'i') | inoremap <S-Insert> <C-R><C-O>+ | endif
 if !hasmapto('<C-R>+', 'c') | cnoremap <S-Insert> <C-R>+ | endif
endif
function! s:Update() abort
 let m = mode(1)
 let command = m =~# '^[c/ ?]'
 let restricted = m !~# '^[iR]' && (!command || s:english)
 if has('gui_running')
  let &imdisable = restricted
 elseif !empty(s:state)
  call writefile([json_encode({'pid':getpid(), 'restricted':restricted})], s:state)
 endif
endfunction
function! s:Release() abort
 if has('gui_running') | set noimdisable | endif
 if !empty(s:state) | call writefile([json_encode({'pid':getpid(), 'restricted':0})], s:state) | endif
endfunction
function! s:Stop() abort
 call s:Release()
 if type(s:job) == v:t_job | call job_stop(s:job) | endif
 if !empty(s:state) | call delete(s:state) | endif
endfunction
function! s:Toggle() abort
 let s:english = !s:english
 call s:Update()
 echo s:english ? 'IME: 命令/搜索英文' : 'IME: 命令/搜索跟随系统'
endfunction
command! EditorImeToggleCommandLineEnglish call <SID>Toggle()
nnoremap <silent> <leader>ime :EditorImeToggleCommandLineEnglish<CR>
augroup editor_ime_mode
 autocmd!
 autocmd ModeChanged,InsertEnter,InsertLeave,CmdlineEnter,CmdlineLeave,FocusGained * call <SID>Update()
 autocmd FocusLost * call <SID>Release()
 autocmd VimLeavePre * call <SID>Stop()
augroup END
if !&ttimeout | set ttimeout ttimeoutlen=40 | endif
call s:Update()
