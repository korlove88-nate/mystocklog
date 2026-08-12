import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#0b1017',borderRadius:14,border:'3px solid #263342',position:'relative'}}>
      <div style={{fontSize:34,fontWeight:800,color:'#f4c45e',letterSpacing:-5,marginLeft:-6}}>M</div>
      <div style={{position:'absolute',right:9,bottom:10,width:20,height:25,display:'flex',alignItems:'flex-end',gap:3}}>
        <div style={{width:4,height:8,background:'#728093',borderRadius:2}}/>
        <div style={{width:4,height:15,background:'#61d6a1',borderRadius:2}}/>
        <div style={{width:4,height:24,background:'#f4c45e',borderRadius:2}}/>
      </div>
    </div>, size,
  )
}
