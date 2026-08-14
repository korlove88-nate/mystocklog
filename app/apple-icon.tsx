import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',background:'#0b1017',position:'relative',padding:16}}>
      <div style={{width:'100%',height:'100%',display:'flex',background:'linear-gradient(145deg,#121b25,#090e14)',borderRadius:36,border:'4px solid #334252',boxShadow:'inset 0 0 0 3px #0a0f15',position:'relative'}}>
        <div style={{position:'absolute',left:23,top:20,fontSize:76,lineHeight:1,fontWeight:800,color:'#f4c45e',letterSpacing:-10}}>M</div>
        <div style={{position:'absolute',right:19,bottom:22,width:52,height:76,display:'flex',alignItems:'flex-end',gap:7}}>
          <div style={{width:10,height:25,background:'#758293',borderRadius:5}}/>
          <div style={{width:10,height:46,background:'#61d6a1',borderRadius:5}}/>
          <div style={{width:10,height:70,background:'#f4c45e',borderRadius:5}}/>
        </div>
      </div>
    </div>, size,
  )
}
