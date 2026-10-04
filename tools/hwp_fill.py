# 원본 .hwp 의 복사본을 한글(COM)로 열어 기존 칸에 글자를 넣는다(10-36).
# 표는 한글이 세는 번호(안쪽 표 포함, 문서 순서)와 「읽는 순서로 몇 번째 칸」으로 집는다.
# 표 모양은 건드리지 않는다. 다만 양식이 줄 추가·표 복사를 허용하는 곳에서만 줄을 더하거나 표를 복사한다.
# 사용: python tools/hwp_fill.py <ops.json> <복사본.hwp> <결과.hwp> [--pdf 결과.pdf] [--hwpx 검증용.hwpx]
# 필요: Windows + 한글 2020 이상 + `pip install pyhwpx`
import json
import os
import re
import shutil
import sys
import tempfile

from pyhwpx import Hwp


def main():
    args = sys.argv[1:]
    ops = json.load(open(args[0], encoding='utf-8'))
    src, out = args[1], args[2]
    opt = {a: args[i + 1] for i, a in enumerate(args) if a.startswith('--') and i + 1 < len(args)}
    work = tempfile.mkdtemp(prefix='hwpfill-')
    path = os.path.join(work, 'form.hwp')
    shutil.copyfile(src, path)  # 원본은 열지 않는다. 한글이 파일 접근 확인창을 띄우지 않도록 임시 폴더에서 연다.
    hwp = Hwp(visible=False)
    log = []

    def addr_now():
        m = re.search(r'[(]([A-Z]+)([0-9]+)[)]', str(hwp.KeyIndicator()[-1]))
        return (m.group(1), int(m.group(2))) if m else None

    def goto_cell(t, r, c):
        # 한글의 칸 이동 순서는 세로로 합친 칸 때문에 표 파일의 칸 순서와 다르다(10-36 실측).
        # 그래서 몇 번째 칸인지가 아니라 칸 주소(열 글자+행 번호, 예: B4)를 보고 도착할 때까지 오른쪽 칸으로 간다.
        want = (chr(65 + c), r + 1)
        hwp.get_into_nth_table(t, select_cell=True)
        hwp.Cancel()
        if want == ('A', 1):
            return  # 표에 들어서면 첫 칸(A1)에 있다. 칸이 하나뿐인 표는 칸 주소가 표시되지 않는다.
        seen = []
        for _ in range(300):
            a = addr_now()
            if a == want:
                return
            seen.append(a)
            hwp.TableRightCell()
        raise RuntimeError(f'표 {t} 의 칸 {want} 에 가지 못했다(마지막 {seen[-6:]})')

    def type_text(text):
        parts = text.split('\n')
        for i, part in enumerate(parts):
            if i:
                hwp.BreakPara()
            if part:
                hwp.insert_text(part)

    def fill(t, r, c, mode, text):
        goto_cell(t, r, c)
        if mode == 'replace':
            hwp.HAction.Run('SelectAll')
            hwp.HAction.Run('Delete')
        elif mode == 'insert':
            hwp.HAction.Run('MoveLineBegin')
        elif mode == 'append':
            hwp.HAction.Run('MoveLineEnd')
        type_text(text)

    def select_table(t):
        ctrl = hwp.get_into_nth_table(t, select_cell=False)
        hwp.set_pos_by_set(ctrl.GetAnchorPos(0))
        hwp.FindCtrl()
        return ctrl

    try:
        if not hwp.open(path):
            raise RuntimeError('한글이 파일을 열지 못했다')
        for n, op in enumerate(ops):
            kind = op['op']
            if kind == 'fill':
                fill(op['t'], op['r'], op['c'], op.get('mode', 'replace'), op['text'])
            elif kind == 'row_below':
                goto_cell(op['t'], op['r'], op['c'])
                hwp.HAction.Run('TableInsertLowerRow')
            elif kind == 'row_delete':
                goto_cell(op['t'], op['r'], op['c'])
                hwp.HAction.Run('TableSubtractRow')
            elif kind == 'merge_v':
                goto_cell(op['t'], op['r'], op['c'])
                hwp.HAction.Run('TableCellBlock')
                hwp.HAction.Run('TableCellBlockExtend')
                for _ in range(op['n'] - 1):
                    hwp.HAction.Run('TableLowerCell')
                hwp.HAction.Run('TableMergeCell')
            elif kind == 'table_copy_after':
                select_table(op['t'])
                hwp.HAction.Run('Copy')
                hwp.HAction.Run('Cancel')
                for _ in range(op.get('times', 1)):
                    select_table(op['t'])
                    hwp.HAction.Run('Cancel')
                    hwp.HAction.Run('MoveParaEnd')
                    hwp.HAction.Run('BreakPara')
                    hwp.HAction.Run('Paste')
            elif kind == 'table_delete':
                select_table(op['t'])
                hwp.HAction.Run('Delete')
            elif kind == 'find_append':
                hwp.HAction.Run('MoveDocBegin')
                if not hwp.find(op['find']):
                    raise RuntimeError('찾지 못함: ' + op['find'])
                hwp.Cancel()
                hwp.HAction.Run('MoveLineEnd')
                type_text(op['text'])
            elif kind == 'find_replace_line':
                hwp.HAction.Run('MoveDocBegin')
                if not hwp.find(op['find']):
                    raise RuntimeError('찾지 못함: ' + op['find'])
                hwp.Cancel()
                hwp.HAction.Run('MoveLineBegin')
                hwp.HAction.Run('MoveSelLineEnd')
                hwp.HAction.Run('Delete')
                type_text(op['text'])
            elif kind == 'delete_back':
                # 찾은 글자가 있는 줄 맨 앞에서 뒤로 지우기를 count 번 한다(예시 표를 지우고 남은 빈 문단 정리).
                hwp.HAction.Run('MoveDocBegin')
                if not hwp.find(op['find']):
                    raise RuntimeError('찾지 못함: ' + op['find'])
                hwp.Cancel()
                hwp.HAction.Run('MoveLineBegin')
                for _ in range(op['count']):
                    hwp.HAction.Run('DeleteBack')
            elif kind == 'find_delete_line':
                hwp.HAction.Run('MoveDocBegin')
                if not hwp.find(op['find']):
                    raise RuntimeError('찾지 못함: ' + op['find'])
                hwp.Cancel()
                hwp.HAction.Run('MoveLineBegin')
                hwp.HAction.Run('MoveSelLineEnd')
                hwp.HAction.Run('Delete')
            else:
                raise RuntimeError('알 수 없는 작업: ' + kind)
            log.append(n)
        hwp.save_as(os.path.join(work, 'out.hwp'), format='HWP')
        shutil.copyfile(os.path.join(work, 'out.hwp'), out)
        if '--hwpx' in opt:
            hwp.save_as(os.path.join(work, 'check.hwpx'), format='HWPX')
            shutil.copyfile(os.path.join(work, 'check.hwpx'), opt['--hwpx'])
        if '--pdf' in opt:
            hwp.save_as(os.path.join(work, 'out.pdf'), format='PDF')
            shutil.copyfile(os.path.join(work, 'out.pdf'), opt['--pdf'])
        print(json.dumps({'ok': True, 'ops': len(ops), 'pages': hwp.PageCount}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({'ok': False, 'failedAt': len(log), 'error': str(e)}))
        sys.exit(1)
    finally:
        try:
            hwp.quit()
        except Exception:  # noqa: BLE001
            pass


if __name__ == '__main__':
    main()
