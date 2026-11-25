#!/usr/bin/env python3
"""Publica o Bastion Barons na Google Play pela API oficial (Google Play Developer API).

  python3 tools/play-publish.py upload release/BastionBarons.aab   -> envia para o TESTE INTERNO
  python3 tools/play-publish.py promote                            -> leva a última versão do teste interno para a PRODUÇÃO

Credencial: variável de ambiente PLAY_SERVICE_ACCOUNT_JSON com o conteúdo do JSON da conta de serviço
(GitHub -> Settings -> Secrets -> Actions). Notas da versão: release-notes/pt-BR.txt e en-US.txt (até 500 letras).
"""
import json
import os
import sys

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

PKG = 'com.bastionbarons.game'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def session():
    raw = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '').strip()
    if not raw:
        sys.exit('Falta o segredo PLAY_SERVICE_ACCOUNT_JSON (veja docs/PLAY_AUTOMATICO.md).')
    cred = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    cred.refresh(Request())
    s = requests.Session()
    s.headers['Authorization'] = 'Bearer ' + cred.token
    return s


def ok(r):
    if r.status_code >= 300:
        sys.exit('Google Play recusou (%d): %s' % (r.status_code, r.text[:1500]))
    return r.json() if r.text else {}


def notes():
    out = []
    for lang in ('pt-BR', 'en-US'):
        p = os.path.join(ROOT, 'release-notes', lang + '.txt')
        if os.path.exists(p):
            text = open(p, encoding='utf-8').read().strip()[:500]
            if text:
                out.append({'language': lang, 'text': text})
    return out


def upload(aab):
    s = session()
    edit = ok(s.post(API + '/edits'))['id']
    with open(aab, 'rb') as f:
        b = ok(s.post(UPLOAD + '/edits/%s/bundles' % edit, params={'uploadType': 'media'}, data=f,
                      headers={'Content-Type': 'application/octet-stream'}, timeout=900))
    vc = str(b['versionCode'])
    release = {'name': '1.0.' + vc, 'versionCodes': [vc], 'status': 'completed', 'releaseNotes': notes()}
    ok(s.put(API + '/edits/%s/tracks/internal' % edit, json={'track': 'internal', 'releases': [release]}))
    ok(s.post(API + '/edits/%s:commit' % edit))
    print('Enviado para o TESTE INTERNO: versão 1.0.%s (código %s)' % (vc, vc))


def promote(src='internal', dst='production'):
    s = session()
    edit = ok(s.post(API + '/edits'))['id']
    track = ok(s.get(API + '/edits/%s/tracks/%s' % (edit, src)))
    done = [r for r in track.get('releases', []) if r.get('status') == 'completed' and r.get('versionCodes')]
    if not done:
        sys.exit('Nenhuma versão pronta no teste interno.')
    r = max(done, key=lambda x: max(int(v) for v in x['versionCodes']))
    release = {'versionCodes': r['versionCodes'], 'status': 'completed', 'releaseNotes': r.get('releaseNotes') or notes()}
    if r.get('name'):
        release['name'] = r['name']
    ok(s.put(API + '/edits/%s/tracks/%s' % (edit, dst), json={'track': dst, 'releases': [release]}))
    ok(s.post(API + '/edits/%s:commit' % edit))
    print('Enviado para a PRODUÇÃO (revisão do Google): versão %s' % release.get('name', r['versionCodes']))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'upload' and len(sys.argv) > 2:
        upload(sys.argv[2])
    elif cmd == 'promote':
        promote()
    else:
        sys.exit(__doc__)
