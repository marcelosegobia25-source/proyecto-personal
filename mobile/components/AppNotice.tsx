import {createContext,useCallback,useContext,useEffect,useRef,useState,type PropsWithChildren} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

type NoticeTone='success'|'error'|'info';
type NoticeInput={title:string;message?:string;tone?:NoticeTone;duration?:number};
type NoticeState=NoticeInput&{id:number};

const NoticeContext=createContext({showNotice:(_notice:NoticeInput)=>{}});

export function AppNoticeProvider({children}:PropsWithChildren){
  const [notice,setNotice]=useState<NoticeState|null>(null);const opacity=useRef(new Animated.Value(0)).current;const insets=useSafeAreaInsets();
  const dismiss=useCallback(()=>Animated.timing(opacity,{toValue:0,duration:160,useNativeDriver:true}).start(()=>setNotice(null)),[opacity]);
  const showNotice=useCallback((next:NoticeInput)=>{setNotice({...next,id:Date.now()});opacity.setValue(0);Animated.spring(opacity,{toValue:1,useNativeDriver:true,damping:18,stiffness:220,mass:.7}).start()},[opacity]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(dismiss,notice.duration??3200);return()=>clearTimeout(timer)},[dismiss,notice]);
  const color=notice?.tone==='error'?'#B42318':notice?.tone==='info'?'#3157D5':'#16845B';
  return <NoticeContext.Provider value={{showNotice}}><View style={s.root}>{children}{notice?<Animated.View style={[s.notice,{top:insets.top+10,borderLeftColor:color,opacity,transform:[{translateY:opacity.interpolate({inputRange:[0,1],outputRange:[-18,0]})}]}]}><View style={s.copy}><Text style={s.title}>{notice.title}</Text>{notice.message?<Text style={s.message}>{notice.message}</Text>:null}</View><Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" onPress={dismiss} hitSlop={12}><Text style={s.close}>×</Text></Pressable></Animated.View>:null}</View></NoticeContext.Provider>
}

export const useAppNotice=()=>useContext(NoticeContext);

const s=StyleSheet.create({root:{flex:1},notice:{position:'absolute',left:16,right:16,zIndex:1000,elevation:12,flexDirection:'row',alignItems:'flex-start',gap:12,backgroundColor:'#172033',borderRadius:16,borderLeftWidth:5,paddingHorizontal:16,paddingVertical:14,shadowColor:'#000',shadowOpacity:.2,shadowRadius:12,shadowOffset:{width:0,height:5}},copy:{flex:1,gap:3},title:{color:'#F8FAFC',fontSize:15,fontWeight:'900'},message:{color:'#CBD5E1',fontSize:13,lineHeight:18},close:{color:'#CBD5E1',fontSize:24,lineHeight:24}});
