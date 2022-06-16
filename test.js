let fsPromise  = require( 'fs/promises');
let fs = require('fs')
var { Mp4DecoderAll } = require( './src/mp4reader.js')
const https = require('https')
let filename='https://file.zhangdong.site/externalLinksController/chain/%E5%8F%8C%E6%8C%87%E7%BC%A9%E6%94%BE%E5%92%8C%E5%8D%95%E6%8C%87%E6%8B%96%E5%8A%A8.mp4?ckey=IEbdk%2Fuu23yUkW69tKjGGqYuhlAK3Wxa8g2DX%2FZayDk2117BJgHbP9fzI0H2vyVB'

https.get(filename, async(res) => {
    // 先下载一个mp4文件到本地
    let filehandle =  await fsPromise.open(`test.mp4`,'w+')
    res.on('data', async(chunk) => {
        await  filehandle.writeFile(chunk)
    })

    res.on('end', async() => {
       
      filehandle.close()
      console.log('保存文件完毕')
      setTimeout(async()=>{
        await test('test.mp4')
      },3000)
    }).on("error", (err) => {
        console.log(err)
    })
})

async function test(filename){
    try{
    let mp4Info = await Mp4DecoderAll(filename)
        console.log(mp4Info)
    }catch(err){
        console.log(err)
        return
    }
}


