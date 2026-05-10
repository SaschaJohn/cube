use super::member_sql::{MemberSql, NativeMemberSql};
use cubenativeutils::wrappers::serializer::{
    NativeDeserialize, NativeDeserializer, NativeSerialize,
};
use cubenativeutils::wrappers::NativeContextHolder;
use cubenativeutils::wrappers::NativeObjectHandle;
use cubenativeutils::CubeError;
use serde::{Deserialize, Serialize};
use std::any::Any;
use std::rc::Rc;

#[derive(Serialize, Deserialize, Debug)]
pub struct LinkItemStatic {
    pub label: String,
    pub icon: Option<String>,
    pub target: Option<String>,
}

#[nativebridge::native_bridge(LinkItemStatic)]
pub trait LinkItem {
    #[nbridge(field)]
    fn url(&self) -> Result<Rc<dyn MemberSql>, CubeError>;
}
