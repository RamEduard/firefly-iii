"use strict";(self["webpackChunkfirefly_iii"]=self["webpackChunkfirefly_iii"]||[]).push([[8020],{8020:(e,t,s)=>{s.r(t),s.d(t,{default:()=>N});var a=s(3673),r=s(2323);const o={class:"row q-mx-md"},i={class:"col-12"},n={class:"text-h6"},u={class:"row"},d={class:"col-12 q-mb-xs"},g=(0,a._)("br",null,null,-1),l={class:"row q-mt-sm"},h={class:"col-12"};function w(e,t,s,w,c,p){const m=(0,a.up)("q-card-section"),b=(0,a.up)("q-card"),f=(0,a.up)("LargeTable"),_=(0,a.up)("q-page");return(0,a.wg)(),(0,a.j4)(_,null,{default:(0,a.w5)((()=>[(0,a._)("div",o,[(0,a._)("div",i,[(0,a.Wm)(b,{bordered:""},{default:(0,a.w5)((()=>[(0,a.Wm)(m,null,{default:(0,a.w5)((()=>[(0,a._)("div",n,(0,r.zw)(c.budget.name),1)])),_:1}),(0,a.Wm)(m,null,{default:(0,a.w5)((()=>[(0,a._)("div",u,[(0,a._)("div",d,[(0,a.Uk)(" Name: "+(0,r.zw)(c.budget.name),1),g])])])),_:1})])),_:1})])]),(0,a._)("div",l,[(0,a._)("div",h,[(0,a.Wm)(f,{ref:"table",title:"Transactions",rows:c.rows,loading:e.loading,onOnRequest:p.onRequest,"rows-number":c.rowsNumber,"rows-per-page":c.rowsPerPage,page:c.page},null,8,["rows","loading","onOnRequest","rows-number","rows-per-page","page"])])])])),_:1})}var c=s(8124),p=s(7914),m=s(4682);const b={name:"Show",data(){return{budget:{},rows:[],rowsNumber:1,rowsPerPage:10,page:1}},created(){"no-budget"===this.$route.params.id&&(this.id=0,this.getWithoutBudget()),"no-budget"!==this.$route.params.id&&(this.id=parseInt(this.$route.params.id),this.getBudget())},components:{LargeTable:c.Z},methods:{onRequest:function(e){this.page=e.page,this.getBudget()},getWithoutBudget:function(){this.budget={name:"(without budget)"},this.loading=!0;const e=new m.Z;this.rows=[];let t=new p.Z;t.transactionsWithoutBudget(this.page,this.getCacheKey).then((t=>{let s=e.parseResponse(t);this.rowsPerPage=s.rowsPerPage,this.rowsNumber=s.rowsNumber,this.rows=s.rows,this.loading=!1}))},getBudget:function(){let e=new p.Z;e.get(this.id).then((e=>this.parseBudget(e))),this.loading=!0;const t=new m.Z;this.rows=[],e.transactions(this.id,this.page,this.getCacheKey).then((e=>{let s=t.parseResponse(e);this.rowsPerPage=s.rowsPerPage,this.rowsNumber=s.rowsNumber,this.rows=s.rows,this.loading=!1}))},parseBudget:function(e){this.budget={name:e.data.data.attributes.name}}}};var f=s(4260),_=s(4379),P=s(151),q=s(5589),v=s(7518),Z=s.n(v);const B=(0,f.Z)(b,[["render",w]]),N=B;Z()(b,"components",{QPage:_.Z,QCard:P.Z,QCardSection:q.Z})}}]);