"""Emit a VMAP 1.0 manifest with inline VAST 3.0 ads (IAB standards)."""
from xml.sax.saxutils import escape

from .creatives import creative_url


def _hms(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def _dur(seconds: int) -> str:
    return _hms(float(seconds))[:8]


def build_vmap(job_id: str, breaks: list[dict], ad_seconds: int, creative_base_url: str, owner_id: int | None = None) -> str:
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0">']
    live = [b for b in breaks if b.get("status", "placed") == "placed"]
    for i, b in enumerate(live, 1):
        brand = b["brand"]
        media = brand.get("creative_url") or creative_url(brand, owner_id)
        bid = f"break-{i}"
        out.append(f'  <vmap:AdBreak timeOffset="{_hms(b["time"])}" breakType="linear" breakId="{bid}">')
        out.append(f'    <vmap:AdSource id="{bid}-src" allowMultipleAds="false" followRedirects="true">')
        out.append('      <vmap:VASTAdData>')
        out.append('        <VAST version="3.0">')
        out.append(f'          <Ad id="{escape(brand["id"])}" sequence="1">')
        out.append('            <InLine>')
        out.append(f'              <AdSystem version="1.0">cuepoint</AdSystem>')
        out.append(f'              <AdTitle>{escape(brand["name"])}</AdTitle>')
        out.append(f'              <Description>{escape(brand.get("tagline", ""))}</Description>')
        out.append('              <Impression><![CDATA[about:blank]]></Impression>')
        out.append('              <Creatives>')
        out.append(f'                <Creative id="{escape(brand["id"])}-creative" sequence="1">')
        out.append('                  <Linear>')
        out.append(f'                    <Duration>{_dur(ad_seconds)}</Duration>')
        out.append('                    <MediaFiles>')
        out.append(f'                      <MediaFile delivery="progressive" type="video/mp4" width="1280" height="720"><![CDATA[{media}]]></MediaFile>')
        out.append('                    </MediaFiles>')
        out.append('                  </Linear>')
        out.append('                </Creative>')
        out.append('              </Creatives>')
        out.append('            </InLine>')
        out.append('          </Ad>')
        out.append('        </VAST>')
        out.append('      </vmap:VASTAdData>')
        out.append('    </vmap:AdSource>')
        out.append('    <vmap:Extensions>')
        out.append(f'      <vmap:Extension type="contextual-placement">')
        out.append(f'        <cutSafety>{b["cut_safety"]}</cutSafety>')
        out.append(f'        <sceneBefore>{escape(b["scene_before"])}</sceneBefore>')
        out.append(f'        <sceneAfter>{escape(b["scene_after"])}</sceneAfter>')
        out.append(f'        <matchMethod>{escape(b["match_method"])}</matchMethod>')
        out.append(f'        <rationale>{escape(b["rationale"])}</rationale>')
        out.append('      </vmap:Extension>')
        out.append('    </vmap:Extensions>')
        out.append('  </vmap:AdBreak>')
    out.append('</vmap:VMAP>')
    return "\n".join(out)
