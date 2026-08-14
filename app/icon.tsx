import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',background:'#0b1017',position:'relative',padding:46}}>
      <div style={{width:'100%',height:'100%',display:'flex',background:'linear-gradient(145deg,#121b25,#090e14)',borderRadius:104,border:'10px solid #334252',boxShadow:'inset 0 0 0 8px #0a0f15',position:'relative'}}>
        <div style={{position:'absolute',left:68,top:56,fontSize:220,lineHeight:1,fontWeight:800,color:'#f4c45e',letterSpacing:-28}}>M</div>
        <div style={{position:'absolute',right:56,bottom:64,width:150,height:220,display:'flex',alignItems:'flex-end',gap:22}}>
          <div style={{width:28,height:72,background:'#758293',borderRadius:14}}/>
          <div style={{width:28,height:132,background:'#61d6a1',borderRadius:14}}/>
          <div style={{width:28,height:205,background:'#f4c45e',borderRadius:14}}/>
        </div>
      </div>
    </div>, size,
  )
}
