import json,gzip,sys,collections
trace,framefile,out=sys.argv[1:]
data=json.load(gzip.open(framefile,'rt'));frames=data['frames'];inputs=data['input']
# Select worst and first downswitch intervals; retain compact event evidence only.
selected=sorted([f for f in frames if f['dt'] and f['dt']>45],key=lambda f:-f['dt'])[:20]
threads={};offset=None;stacks=collections.defaultdict(list);top={};near=[[] for f in selected];compiles=[]
for line in open(trace):
 try:e=json.loads(line.strip().rstrip(','))
 except:continue
 if e.get('name')=='p3x-wheel':offset=e['ts']-inputs[0]['t']*1000;break
for line in open(trace):
 try:e=json.loads(line.strip().rstrip(','))
 except:continue
 key=f"{e.get('pid')}:{e.get('tid')}";name=e.get('name','');ph=e.get('ph');ts=e.get('ts',0)
 if name=='thread_name':threads[key]=e['args']['name']
 if name=='p3x-wheel' and offset is None:offset=ts-inputs[0]['t']*1000
 if ph=='B':stacks[key].append(e);continue
 if ph=='E':
  if not stacks[key]:continue
  begin=stacks[key].pop();begin['dur']=ts-begin['ts'];e=begin;ts=e['ts'];name=e.get('name','')
 elif ph!='X':continue
 dur=e.get('dur',0)
 if dur<=0:continue
 k=f"{threads.get(key,key)}:{name}";r=top.setdefault(k,{'n':0,'total':0,'max':0});r['n']+=1;r['total']+=dur/1000;r['max']=max(r['max'],dur/1000)
 if offset is None or dur<500:continue
 for i,f in enumerate(selected):
  start=(f['t']-f['dt'])*1000+offset;end=f['t']*1000+offset
  overlap=min(end,ts+dur)-max(start,ts)
  if overlap>0:near[i].append({'name':name,'thread':threads.get(key,key),'ms':dur/1000,'cpuMs':e.get('tdur',0)/1000,'overlapMs':overlap/1000,'at':(ts-offset)/1000,'args':e.get('args')})
 if any(s in name.lower() for s in ['shader','compile','linkprogram']):compiles.append({'name':name,'ms':dur/1000,'thread':threads.get(key,key),'at':(ts-offset)/1000})
result={'offset':offset,'threads':threads,'top':sorted(top.items(),key=lambda p:-p[1]['max'])[:100],'compile':compiles,'frames':[{**f,'events':sorted(events,key=lambda e:-e['overlapMs'])[:45]} for f,events in zip(selected,near)]}
json.dump(result,open(out,'w'),indent=2)
print(json.dumps({'top':result['top'][:15],'frames':[{'t':f['t'],'dt':f['dt'],'cpu':f['cpu'],'gpu':f['gpu'],'events':f['events'][:12]}for f in result['frames'][:4]]},indent=2))
